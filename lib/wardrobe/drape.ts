// 옷 한 벌을 체형(마네킹 모프)에 맞춰 늘어뜨린다. Worker(drape-worker.ts)와 테스트가 같은 과정을 쓴다.
// 하의는 몸 위에, 상의는 몸과 (늘어뜨린) 하의 위에 늘어뜨린다.
import * as THREE from 'three';
import {makeGarment} from './geometry';
import {bodyPositions,type MannequinMesh} from './mannequin-mesh';
import {buildBodySdf,type SdfMesh} from './body-sdf';
import {clothBounds,drapeGarment,DRAPE_BOTTOM,DRAPE_DEFAULTS,type DrapeSettings} from './cloth';
import type {BodyProfile,Product,SizeMeasurements} from './types';

// positions: 이미 늘어뜨린 하의의 조각별 정점 위치(makeGarment(…,{fine:true})의 조각 순서). 없으면 절차형 모양을 쓴다.
export type UnderGarment={product:Product;size:SizeMeasurements;positions?:Float32Array[]};

export function drapeBottom(group:THREE.Group,mannequin:MannequinMesh,body:BodyProfile,settings:DrapeSettings=DRAPE_BOTTOM){
 const bounds=clothBounds(group,.08);if(!bounds)return null;
 return drapeGarment(group,buildBodySdf([{positions:bodyPositions(mannequin,body),indices:mannequin.indices}],bounds),settings);
}

export function drapeTop(group:THREE.Group,mannequin:MannequinMesh,body:BodyProfile,under?:UnderGarment,settings:DrapeSettings=DRAPE_DEFAULTS){
 const bounds=clothBounds(group);if(!bounds)return null;
 const colliders:SdfMesh[]=[{positions:bodyPositions(mannequin,body),indices:mannequin.indices}];
 if(under)colliders.push(...underColliders(under,body));
 return drapeGarment(group,buildBodySdf(colliders,bounds),settings);
}

// 조각별 정점 위치를 옷 그룹에 그대로 넣는다(조각 수·정점 수가 같을 때만). 법선은 다시 계산한다.
export function applyPositions(group:THREE.Group,positions:Float32Array[]){
 const meshes:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
 if(meshes.length!==positions.length||meshes.some((mesh,i)=>mesh.geometry.getAttribute('position').array.length!==positions[i].length))return false;
 meshes.forEach((mesh,i)=>{const attribute=mesh.geometry.getAttribute('position') as THREE.BufferAttribute;(attribute.array as Float32Array).set(positions[i]);attribute.needsUpdate=true;mesh.geometry.computeVertexNormals();});
 return true;
}

// 하의는 바지 천·허리밴드를 바깥으로 6mm, 벨트 고리·앞 여밈선(닫힌 상자)은 3mm 부풀려 넣는다. 원단 두께와 장식이
// 상의를 뚫고 보이지 않게 하기 위해서다. 늘어뜨린 하의가 있으면 그 모양을 쓴다.
function underColliders(under:UnderGarment,body:BodyProfile):SdfMesh[]{
 const bottom=makeGarment(under.product,under.size,body,false,{fine:true});
 if(under.positions)applyPositions(bottom,under.positions);
 bottom.updateMatrixWorld(true);
 const point=new THREE.Vector3(),out:SdfMesh[]=[];
 bottom.traverse(o=>{
  if(!(o instanceof THREE.Mesh))return;
  const tube=['bottom-body','bottom-waistband'].includes(o.name),box=o.geometry instanceof THREE.BoxGeometry;if(!tube&&!box)return;
  if(tube)o.geometry.computeVertexNormals();
  const position=o.geometry.getAttribute('position'),normal=o.geometry.getAttribute('normal'),positions=new Float32Array(position.count*3);
  for(let i=0;i<position.count;i++){
   if(tube)point.set(position.getX(i)+normal.getX(i)*.006,position.getY(i)+normal.getY(i)*.006,position.getZ(i)+normal.getZ(i)*.006);
   else point.set(position.getX(i)+Math.sign(position.getX(i))*.003,position.getY(i)+Math.sign(position.getY(i))*.003,position.getZ(i)+Math.sign(position.getZ(i))*.003).applyMatrix4(o.matrixWorld);
   positions[i*3]=point.x;positions[i*3+1]=point.y;positions[i*3+2]=point.z;
  }
  out.push({positions,indices:Uint32Array.from(o.geometry.getIndex()!.array)});
 });
 bottom.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});
 return out;
}
