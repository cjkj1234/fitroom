import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {PRODUCTS} from './catalog';
import {DEFAULT_BODY} from './body';
import {makeGarment,disposeGroup} from './geometry';
import type {Product} from './types';

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

// 허용 비율은 현재 형태에서 측정한 값에 여유를 둔 상한이다. 옷 형태를 바꿔 이 값을 넘기면 몸이 옷을 뚫고 나오는지 화면에서 확인한다.
const LIMITS:Record<string,number>={hat:.005,top:.05,bottom:.03};
for(const product of PRODUCTS){
 test(`${product.name}: 마네킹 몸이 옷 밖으로 뚫고 나오지 않는다`,t=>{
  const result=exposedShare(product);
  t.diagnostic(`노출 ${(result.share*100).toFixed(2)}% (${result.exposed}/${result.tested})`);
  assert.ok(result.tested>100,`검사 정점이 충분해야 한다 (${result.tested})`);
  assert.ok(result.share<=LIMITS[product.slot],`${product.slot} 노출 ${(result.share*100).toFixed(1)}% (${result.exposed}/${result.tested}) > 허용 ${(LIMITS[product.slot]*100).toFixed(1)}%`);
 });
}
