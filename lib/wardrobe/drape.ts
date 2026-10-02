// 상의 한 벌을 체형(마네킹 모프)과 함께 입은 하의 위에 늘어뜨린다. Worker(drape-worker.ts)와 테스트가 같은 과정을 쓴다.
import * as THREE from 'three';
import {makeGarment} from './geometry';
import {bodyPositions,type MannequinMesh} from './mannequin-mesh';
import {buildBodySdf,type SdfMesh} from './body-sdf';
import {clothBounds,drapeGarment,DRAPE_DEFAULTS,type DrapeSettings} from './cloth';
import type {BodyProfile,Product,SizeMeasurements} from './types';

export function drapeTop(group:THREE.Group,mannequin:MannequinMesh,body:BodyProfile,under?:{product:Product;size:SizeMeasurements},settings:DrapeSettings=DRAPE_DEFAULTS){
 const bounds=clothBounds(group);if(!bounds)return null;
 const colliders:SdfMesh[]=[{positions:bodyPositions(mannequin,body),indices:mannequin.indices}];
 if(under)colliders.push(...underColliders(under.product,under.size,body));
 return drapeGarment(group,buildBodySdf(colliders,bounds),settings);
}

// 하의는 엉덩이·다리·허리밴드 관을 바깥으로 6mm, 벨트 고리·앞 여밈선(닫힌 상자)은 3mm 부풀려 넣는다. 원단 두께와 장식이
// 상의를 뚫고 보이지 않게 하기 위해서다.
function underColliders(product:Product,size:SizeMeasurements,body:BodyProfile):SdfMesh[]{
 const bottom=makeGarment(product,size,body);bottom.updateMatrixWorld(true);
 const point=new THREE.Vector3(),out:SdfMesh[]=[];
 bottom.traverse(o=>{
  if(!(o instanceof THREE.Mesh))return;
  const tube=['bottom-seat','bottom-leg','bottom-waistband'].includes(o.name),box=o.geometry instanceof THREE.BoxGeometry;if(!tube&&!box)return;
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
