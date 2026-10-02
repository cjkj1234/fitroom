/// <reference lib="webworker" />
// 상의 처짐 시뮬레이션을 화면을 막지 않도록 Worker에서 돌린다. 화면 쪽(avatar-view)과 같은 입력으로 같은 옷(makeGarment)을 만들어
// 시뮬레이션한 뒤 조각별 정점 위치만 돌려준다. 마네킹은 이 Worker가 처음 한 번 받아 둔다.
import * as THREE from 'three';
import {makeGarment} from './geometry';
import {parseMannequin,type MannequinMesh} from './mannequin-mesh';
import {drapeTop} from './drape';
import type {BodyProfile,Product,SizeMeasurements} from './types';

// under: 함께 입은 하의. 상의가 그 위로 걸치도록 하의의 엉덩이·다리 관도 충돌체에 넣는다.
export type DrapeRequest={key:string;product:Product;size:SizeMeasurements;body:BodyProfile;fitView:boolean;textured:boolean;under?:{product:Product;size:SizeMeasurements}};
export type DrapeResponse={key:string;positions:Float32Array[];ms:number}|{key:string;error:string};

let mannequin:Promise<MannequinMesh>|null=null;
self.onmessage=async(event:MessageEvent<DrapeRequest>)=>{
 const {key,product,size,body,fitView,textured,under}=event.data;
 try{
  mannequin??=fetch('/models/mannequin.glb').then(response=>{if(!response.ok)throw new Error(`마네킹 ${response.status}`);return response.arrayBuffer();}).then(buffer=>parseMannequin(new Uint8Array(buffer)));
  const mesh=await mannequin,started=performance.now();
  // 앞면 사진 텍스처는 화면 쪽에만 있다. 조각 구성만 같으면 되므로 빈 텍스처를 넘긴다.
  const group=makeGarment(product,size,body,false,{fine:true,fitView,frontTexture:textured?new THREE.Texture():undefined});
  drapeTop(group,mesh,body,under);
  const positions:Float32Array[]=[];
  group.traverse(o=>{if(o instanceof THREE.Mesh)positions.push(new Float32Array(o.geometry.getAttribute('position').array));});
  group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});
  const response:DrapeResponse={key,positions,ms:Math.round(performance.now()-started)};
  (self as DedicatedWorkerGlobalScope).postMessage(response,positions.map(p=>p.buffer));
 }catch(error){
  const response:DrapeResponse={key,error:error instanceof Error?error.message:String(error)};
  (self as DedicatedWorkerGlobalScope).postMessage(response);
 }
};
