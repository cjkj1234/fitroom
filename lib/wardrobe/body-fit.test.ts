import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {PRODUCTS} from './catalog';
import {DEFAULT_BODY,cloneBody,makePreset} from './body';
import {bodyShape} from './body-shape';
import {makeGarment,disposeGroup} from './geometry';
import {bodyPositions,parseMannequin,sliceAt,torsoAndLeg} from './mannequin-mesh';
import type {BodyProfile,Product} from './types';

// 체형 모프를 실제로 적용한 마네킹으로, 옷이 몸을 덮는지와 몸 단면 표(mannequin-sections.ts)가 맞는지 검사한다.
const mesh=parseMannequin(new Uint8Array(readFileSync(new URL('../../public/models/mannequin.glb',import.meta.url))));
const mixed=cloneBody(DEFAULT_BODY);Object.assign(mixed.measurements,{height:168,chest:104,waist:96,hips:104,shoulders:44,legLength:98});
// 실제 평면 셔츠 사진에서 잰 몸판 실루엣(비율 숫자만)을 넣은 상의도 같은 기준으로 검사한다.
const PHOTO_SHIRT:Product={...PRODUCTS.find(item=>item.slot==='top')!,id:'photo-shirt',name:'사진 실루엣 셔츠',photoShape:{version:1,bodyWidths:[1,1.005,1.015,1.03,1.04,1.045,1.055,1.06,1.07,1.07,1.04],armpit:.505,lengthToChest:1.635}};
const BODIES:Array<[string,BodyProfile]>=[['160 마름',makePreset(160,'slim')],['175 큰 체형',makePreset(175,'broad')],['185 큰 체형',makePreset(185,'broad')],['168 혼합 입력',mixed]];

test('중립 마네킹 단면 둘레는 보정 기준(가슴 96·허리 80·엉덩이 98·머리 57cm)과 같다',()=>{
 const shape=bodyShape(DEFAULT_BODY);
 // 표는 2cm 간격이라 행 사이(0.95m 등)는 보간한다. 보간 오차를 고려해 1cm까지 허용한다.
 for(const [y,cm] of [[1.3,96],[1.12,80],[.95,98],[1.66,57]] as const)assert.ok(Math.abs(shape.torso(y)!.perimeter*100-cm)<1,`${y}m ${shape.torso(y)!.perimeter*100}cm`);
});

for(const [name,body] of BODIES){
 test(`${name}: 단면 표로 계산한 몸 둘레가 실제 모프 마네킹과 맞는다`,()=>{
  const shape=bodyShape(body),positions=bodyPositions(mesh,body),k=body.measurements.height/175;
  for(const [yRef,tolerance] of [[.3,1],[.6,1],[.95,1.2],[1.12,1.2],[1.2,1.2],[1.3,2.5],[1.66,1]] as const){
   const y=yRef*k,{torso,leg}=torsoAndLeg(sliceAt(positions,mesh.indices,y)),real=torso??leg,predicted=torso?shape.torso(y):shape.leg(y);
   assert.ok(real&&predicted,`${yRef}m 단면`);
   const error=Math.abs(predicted!.perimeter-real!.perimeter)*100;
   assert.ok(error<tolerance,`${yRef}m 둘레 오차 ${error.toFixed(2)}cm`);
  }
 });
}

// 옷이 덮어야 하는 몸 정점에서 몸 중심 반대쪽으로 광선을 쏘아, 옷을 만나지 못하면(몸이 옷 밖으로 나오면) 노출로 센다.
function exposedShare(product:Product,body:BodyProfile,positions:Float32Array){
 const size=product.sizes.find(item=>item.label===product.defaultSize)??product.sizes[0],shape=bodyShape(body),m=body.measurements,k=m.height/175;
 const group=makeGarment(product,size,body);group.updateMatrixWorld(true);
 const meshes:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
 const hemY=(m.legLength-(size.length??105))/100,raycaster=new THREE.Raycaster();raycaster.far=1.5;
 const centerOf=(p:THREE.Vector3)=>{
  const torso=shape.torso(p.y),inTorso=torso!==null&&Math.abs(p.x)<=torso.rx+.005;
  if(product.slot==='top')return p.y>.88*k&&p.y<1.4*k&&inTorso?new THREE.Vector3(0,p.y,torso.z):null;
  if(product.slot==='hat')return p.y>1.66*k&&p.y<1.75*k&&inTorso?new THREE.Vector3(0,p.y,torso.z):null;
  if(p.y<=Math.max(.06,hemY+.06)||p.y>=Math.min(1.04*k,m.legLength/100-.01))return null;
  if(inTorso)return new THREE.Vector3(0,p.y,torso.z);
  const leg=shape.leg(p.y);
  return leg&&Math.abs(Math.abs(p.x)-leg.x)<=leg.rx+.005?new THREE.Vector3(Math.sign(p.x)*leg.x,p.y,leg.z):null;
 };
 let tested=0,exposed=0;
 for(let i=0;i<positions.length/3;i+=2){
  const p=new THREE.Vector3(positions[i*3],positions[i*3+1],positions[i*3+2]),center=centerOf(p);if(!center)continue;
  const direction=new THREE.Vector3(p.x-center.x,0,p.z-center.z);if(direction.length()<1e-6)continue;
  tested++;raycaster.set(p,direction.normalize());if(raycaster.intersectObjects(meshes,false).length===0)exposed++;
 }
 disposeGroup(group);
 return {tested,exposed,share:exposed/Math.max(1,tested)};
}

// 허용 비율은 몸 단면 덮기를 넣은 뒤 측정한 값에 여유를 둔 상한이다(기본 체형 검사는 mannequin-fit.test.ts).
const LIMITS:Record<string,number>={hat:.005,top:.06,bottom:.04};
for(const [name,body] of BODIES){
 test(`${name}: 체형이 바뀌어도 몸이 옷 밖으로 뚫고 나오지 않는다`,t=>{
  const positions=bodyPositions(mesh,body);
  for(const product of [...PRODUCTS,PHOTO_SHIRT]){
   const result=exposedShare(product,body,positions);
   t.diagnostic(`${product.name} 노출 ${(result.share*100).toFixed(2)}% (${result.exposed}/${result.tested})`);
   assert.ok(result.tested>60,`${product.name}: 검사 정점이 충분해야 한다 (${result.tested})`);
   assert.ok(result.share<=LIMITS[product.slot],`${product.name} ${product.slot} 노출 ${(result.share*100).toFixed(1)}% > 허용 ${(LIMITS[product.slot]*100).toFixed(1)}%`);
  }
 });
}
