/// <reference lib="webworker" />
// 옷 처짐 시뮬레이션을 화면을 막지 않도록 Worker에서 돌린다. 화면 쪽(avatar-view)과 같은 입력으로 같은 옷(makeGarment)을 만들어
// 시뮬레이션한 뒤 조각별 정점 위치만 돌려준다. 마네킹은 이 Worker가 처음 한 번 받아 둔다.
// 하의를 먼저 늘어뜨려 기억해 두고, 상의는 함께 입은 하의의 늘어뜨린 모양 위에 늘어뜨린다.
import * as THREE from 'three';
import {makeGarment} from './geometry';
import {parseMannequin,type MannequinMesh} from './mannequin-mesh';
import {drapeBottom,drapeTop} from './drape';
import {DRAPE_BOTTOM,DRAPE_DEFAULTS} from './cloth';
import type {BodyProfile,Product,SizeMeasurements} from './types';

// under: 상의와 함께 입은 하의.
export type DrapeRequest={key:string;product:Product;size:SizeMeasurements;body:BodyProfile;fitView:boolean;textured:boolean;under?:{product:Product;size:SizeMeasurements}};
// partial: 시뮬레이션 중간 모양(done은 진행률 0~1). 마지막 응답에는 partial이 없다.
export type DrapeResponse={key:string;positions:Float32Array[];ms:number;partial?:boolean;done?:number}|{key:string;error:string};

let mannequin:Promise<MannequinMesh>|null=null;
// 늘어뜨린 하의(조각별 정점 위치). 하의 조각 구성은 핏 보기 여부와 관계없이 같으므로 상품·치수·체형으로만 구분한다.
const bottoms=new Map<string,Float32Array[]>();
const positionsOf=(group:THREE.Group)=>{const out:Float32Array[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)out.push(new Float32Array(o.geometry.getAttribute('position').array));});return out;};
const dispose=(group:THREE.Group)=>group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});

// 중간 모양을 화면에 보낸다(옷이 내려앉는 모습). 위치 배열은 넘겨주고 새로 만든다.
const post=(response:DrapeResponse)=>(self as DedicatedWorkerGlobalScope).postMessage(response,'positions' in response?response.positions.map(p=>p.buffer):[]);
const progress=(key:string,group:THREE.Group,started:number)=>(done:number)=>post({key,positions:positionsOf(group),ms:Math.round(performance.now()-started),partial:true,done});

function drapedBottom(mesh:MannequinMesh,product:Product,size:SizeMeasurements,body:BodyProfile,show?:{key:string;started:number}){
 const key=JSON.stringify([{...product,frontTexture:undefined},size,body.measurements]),cached=bottoms.get(key);
 if(cached)return cached;
 const group=makeGarment(product,size,body,false,{fine:true});drapeBottom(group,mesh,body,DRAPE_BOTTOM,show&&progress(show.key,group,show.started));
 const positions=positionsOf(group);dispose(group);
 bottoms.set(key,positions);while(bottoms.size>8)bottoms.delete(bottoms.keys().next().value!);
 return positions;
}

const loadMannequin=()=>mannequin??=fetch('/models/mannequin.glb').then(response=>{if(!response.ok)throw new Error(`마네킹 ${response.status}`);return response.arrayBuffer();}).then(buffer=>parseMannequin(new Uint8Array(buffer)));

// {warm:true}: 화면이 열릴 때 미리 마네킹을 받아 둔다(응답 없음).
self.onmessage=async(event:MessageEvent<DrapeRequest|{warm:true}>)=>{
 if('warm' in event.data){loadMannequin().catch(()=>{mannequin=null;});return;}
 const {key,product,size,body,fitView,textured,under}=event.data;
 try{
  const mesh=await loadMannequin(),started=performance.now();
  let positions:Float32Array[];
  if(product.slot==='bottom')positions=drapedBottom(mesh,product,size,body,{key,started}).map(p=>new Float32Array(p));
  else{
   // 앞면 사진 텍스처는 화면 쪽에만 있다. 조각 구성만 같으면 되므로 빈 텍스처를 넘긴다.
   const group=makeGarment(product,size,body,false,{fine:true,fitView,frontTexture:textured?new THREE.Texture():undefined});
   drapeTop(group,mesh,body,under&&{...under,positions:drapedBottom(mesh,under.product,under.size,body)},DRAPE_DEFAULTS,progress(key,group,started));
   positions=positionsOf(group);dispose(group);
  }
  post({key,positions,ms:Math.round(performance.now()-started)});
 }catch(error){
  post({key,error:error instanceof Error?error.message:String(error)});
 }
};
