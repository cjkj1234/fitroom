import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {PRODUCTS} from './catalog';
import {DEFAULT_BODY} from './body';
import {makeGarment,disposeGroup} from './geometry';
import {sellerProductToWardrobeProduct} from '../seller/catalog';
import {emptySellerSize,type SellerProduct} from '../seller/products';
import type {Product} from './types';

// 판매자가 등록한 오픈카라 셔츠와 카펜터 하프팬츠(실제 상품 사진을 보고 만든 예시)도 같은 기준으로 검사한다.
const now='2026-09-29T00:00:00.000Z';
const sellerBase={version:1 as const,storeName:'테스트상점',material:null,priceKrw:10000,stock:1,purchaseUrl:null,createdAt:now,updatedAt:now,status:'published' as const,publishedAt:now};
const SELLER_SAMPLES:SellerProduct[]=[
 {...sellerBase,id:'shirt',name:'오픈카라 반팔 셔츠',category:'top',color:'카키',colorHex:'#787260',features:['오픈카라','단추 여밈','왼쪽 가슴 포켓','루즈 핏'],sizes:[{...emptySellerSize('M'),length:72,chestFlat:58,shoulder:52,sleeve:24}]},
 // 같은 셔츠에 실제 평면 사진에서 잰 몸판 실루엣(비율 숫자만)을 넣은 경우.
 {...sellerBase,id:'shirt-photo',name:'오픈카라 반팔 셔츠',category:'top',color:'카키',colorHex:'#787260',features:['오픈카라','단추 여밈','왼쪽 가슴 포켓','루즈 핏'],sizes:[{...emptySellerSize('M'),length:72,chestFlat:58,shoulder:52,sleeve:24}],photoShape:{version:1,bodyWidths:[1,1.005,1.015,1.03,1.04,1.045,1.055,1.06,1.07,1.07,1.04],armpit:.505,lengthToChest:1.635}},
 {...sellerBase,id:'cargo',name:'카펜터 와이드 하프 팬츠',category:'bottom',color:'카키',colorHex:'#736249',features:['와이드 핏','뒷면 패치 포켓','옆 카고 포켓'],sizes:[{...emptySellerSize('M'),length:58,waistFlat:40,hipsFlat:60,thighFlat:38,rise:33}]},
];

// 실제 마네킹(public/models/mannequin.glb)의 정점을 옷 안쪽에서 바깥으로 쏘아, 옷 표면을 만나지 못하는(=몸이 옷을 뚫고 나온) 정점의 비율을 잰다.
function loadMannequin(){
 const buffer=readFileSync(new URL('../../public/models/mannequin.glb',import.meta.url));
 const jsonLength=buffer.readUInt32LE(12),json=JSON.parse(buffer.subarray(20,20+jsonLength).toString()),bin=buffer.subarray(20+jsonLength+8);
 const points:THREE.Vector3[]=[];
 for(const mesh of json.meshes)for(const primitive of mesh.primitives){
  const accessor=json.accessors[primitive.attributes.POSITION],view=json.bufferViews[accessor.bufferView];
  const offset=(view.byteOffset||0)+(accessor.byteOffset||0),stride=view.byteStride||12;
  for(let i=0;i<accessor.count;i++){const o=offset+i*stride;points.push(new THREE.Vector3(bin.readFloatLE(o),bin.readFloatLE(o+4),bin.readFloatLE(o+8)));}
 }
 let minY=Infinity,maxY=-Infinity;for(const p of points){minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
 const scale=DEFAULT_BODY.measurements.height/100/(maxY-minY);for(const p of points)p.y=(p.y-minY)*scale;
 return points;
}
const mannequin=loadMannequin();

function exposedShare(product:Product){
 const size=product.sizes.find(item=>item.label===product.defaultSize)??product.sizes[0];
 const group=makeGarment(product,size,DEFAULT_BODY);group.updateMatrixWorld(true);
 const meshes:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
 const hemY=(DEFAULT_BODY.measurements.legLength-(size.length??105))/100;
 // 검사 범위: 옷이 덮어야 하는 몸의 부분만. 목·발·팔·손처럼 옷 밖에 있는 부분과 옷 윗단 위는 제외한다.
 const inRegion=(p:THREE.Vector3)=>product.slot==='top'?p.y>.88&&p.y<1.47&&Math.abs(p.x)<.235:product.slot==='bottom'?p.y>Math.max(.06,hemY+.06)&&p.y<1.04&&Math.abs(p.x)<(p.y>.75?.26:.3):p.y>1.66&&p.y<1.75;
 const axis=(p:THREE.Vector3)=>product.slot==='hat'?new THREE.Vector3(0,p.y,.06):product.slot==='bottom'&&p.y<.82?new THREE.Vector3(Math.sign(p.x)*.15,p.y,.02):new THREE.Vector3(0,p.y,.04);
 const raycaster=new THREE.Raycaster();raycaster.far=1.5;
 let tested=0,exposed=0;
 mannequin.forEach((p,index)=>{
  if(index%2||!inRegion(p))return;
  const center=axis(p),direction=new THREE.Vector3(p.x-center.x,0,p.z-center.z);if(direction.length()<1e-6)return;
  tested++;raycaster.set(p,direction.normalize());if(raycaster.intersectObjects(meshes,false).length===0)exposed++;
 });
 disposeGroup(group);
 return {tested,exposed,share:exposed/Math.max(1,tested)};
}

test('앞면 텍스처를 입힌 셔츠는 앞면 패치에 UV가 있고 절차형 앞면 세부는 생략한다',()=>{
 const shirt=sellerProductToWardrobeProduct(SELLER_SAMPLES[0]),size=shirt.sizes[0];
 const plain=makeGarment(shirt,size,DEFAULT_BODY),textured=makeGarment(shirt,size,DEFAULT_BODY,false,{frontTexture:new THREE.Texture()});
 const front=textured.getObjectByName('front-texture');
 assert.ok(front instanceof THREE.Mesh);
 const uv=front.geometry.getAttribute('uv'),position=front.geometry.getAttribute('position');
 assert.equal(uv.count,position.count);
 assert.ok(Array.from(position.array).every(Number.isFinite));
 assert.ok(Array.from(uv.array as ArrayLike<number>).every(value=>value>=0&&value<=1),'UV는 0–1 범위');
 assert.equal(plain.getObjectByName('front-texture'),undefined);
 const meshes=(group:THREE.Group)=>{let count=0;group.traverse(o=>{if(o instanceof THREE.Mesh)count++;});return count;};
 assert.ok(meshes(textured)<meshes(plain),'사진에 있는 카라·단추·주머니는 다시 그리지 않는다');
 disposeGroup(plain);disposeGroup(textured);
});

// 허용 비율은 현재 형태에서 측정한 값에 여유를 둔 상한이다. 옷 형태를 바꿔 이 값을 넘기면 몸이 옷을 뚫고 나오는지 화면에서 확인한다.
const LIMITS:Record<string,number>={hat:.005,top:.05,bottom:.03};
for(const product of [...PRODUCTS,...SELLER_SAMPLES.map(sample=>sellerProductToWardrobeProduct(sample))]){
 test(`${product.name}: 마네킹 몸이 옷 밖으로 뚫고 나오지 않는다`,t=>{
  const result=exposedShare(product);
  t.diagnostic(`노출 ${(result.share*100).toFixed(2)}% (${result.exposed}/${result.tested})`);
  assert.ok(result.tested>100,`검사 정점이 충분해야 한다 (${result.tested})`);
  assert.ok(result.share<=LIMITS[product.slot],`${product.slot} 노출 ${(result.share*100).toFixed(1)}% (${result.exposed}/${result.tested}) > 허용 ${(LIMITS[product.slot]*100).toFixed(1)}%`);
 });
}
