'use client';
import { useEffect,useRef,useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RotateCcw, Plus, Minus, Move, LoaderCircle, Shirt, Ruler, Pause, Play } from 'lucide-react';
import type { BodyProfile,Outfit,Product } from '@/lib/wardrobe/types';
import { makeGarment,disposeGroup,FIT_LEGEND,FIT_SIM_LEGEND,simFitColor,HAT_BASE_DROP } from '@/lib/wardrobe/geometry';
import { morphWeights } from '@/lib/wardrobe/body-shape';
import { smoothNormals } from '@/lib/wardrobe/cloth';
import { morphFrame,morphPart,morphedPositions,type MannequinMesh } from '@/lib/wardrobe/mannequin-mesh';
import { buildHair } from '@/lib/wardrobe/hair';
import { fabricNormalMap } from '@/lib/wardrobe/fabric';
import { DEFAULT_APPEARANCE,hairColor,skinColor,type Appearance } from '@/lib/wardrobe/appearance';
import { createPhotoCache } from '@/lib/wardrobe/photo-assets';
import { frameAvatar,STAGE_FOV,type StageFraming,type StageInsets } from '@/lib/wardrobe/camera';
import { avatarPose,boneIndex,garmentSkin,parseRig,placeJoints,type RigBone,type Skin } from '@/lib/wardrobe/rig';
import type { DrapeRequest,DrapeResponse } from '@/lib/wardrobe/drape-worker';
// 개발 서버에서는 이 컴포넌트의 import.meta.url이 file:// 주소라 new URL(…, import.meta.url)로 만든 Worker 주소를 브라우저가 거부한다.
// 그래서 Vite가 묶어 준 Worker 주소를 직접 받아 쓴다.
import drapeWorkerUrl from '@/lib/wardrobe/drape-worker.ts?worker&url';

function addStoreEnvironment(scene:THREE.Scene){
 const room=new THREE.Group();room.name='virtual-store-room';
 const floorMaterial=new THREE.MeshStandardMaterial({color:'#d9d3c9',roughness:.88});
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(5,4),floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.set(0,-.015,-.35);floor.receiveShadow=true;room.add(floor);
 const wallMaterial=new THREE.MeshStandardMaterial({color:'#ece9e3',roughness:.94});
 const wall=new THREE.Mesh(new THREE.PlaneGeometry(4.4,2.8),wallMaterial);wall.position.set(0,1.38,-1.05);wall.receiveShadow=true;room.add(wall);
 const mirror=new THREE.Mesh(new THREE.PlaneGeometry(1.05,2.2),new THREE.MeshPhysicalMaterial({color:'#cfd6d8',metalness:.25,roughness:.2}));mirror.position.set(0,1.16,-1.035);room.add(mirror);
 const frameMaterial=new THREE.MeshStandardMaterial({color:'#36383b',roughness:.6});
 const box=(width:number,height:number,depth:number,x:number,y:number,z:number)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),frameMaterial);mesh.position.set(x,y,z);mesh.castShadow=true;room.add(mesh);};
 box(1.16,.035,.035,0,.06,-1);box(1.16,.035,.035,0,2.26,-1);box(.035,2.24,.035,-.58,1.16,-1);box(.035,2.24,.035,.58,1.16,-1);
 for(const side of [-1,1]){box(.035,1.35,.035,side*1.15,.68,-.53);box(.035,1.35,.035,side*1.62,.68,-.53);box(.5,.035,.035,side*1.385,1.34,-.53);box(.5,.035,.34,side*1.385,.12,-.53);}
 const mat=new THREE.MeshStandardMaterial({color:'#b9a88e',roughness:.8});for(const x of [-1.9,1.9]){const panel=new THREE.Mesh(new THREE.BoxGeometry(.16,2.8,.08),mat);panel.position.set(x,1.38,-1);room.add(panel);}
 scene.add(room);
}

// 핏 보기 켜짐 상태는 매장을 옮겨도(아바타 화면이 다시 만들어져도) 이 탭에서 유지한다. 저장이 막힌 환경에서는 꺼진 상태로 시작한다.
const FIT_VIEW_KEY='fitroom.fitView.v1';
function readFitView(){try{return typeof window!=='undefined'&&window.sessionStorage.getItem(FIT_VIEW_KEY)==='1';}catch{return false;}}
function writeFitView(on:boolean){try{window.sessionStorage.setItem(FIT_VIEW_KEY,on?'1':'0');}catch{}}

// 상의·하의는 먼저 절차형 모양으로 보여 주고, Worker에서 처짐 시뮬레이션이 끝나면 정점 위치를 바꿔 끼운다. 같은 옷·치수·체형이면 결과를 다시 쓴다.
const drapeKey=(request:Omit<DrapeRequest,'key'>)=>JSON.stringify([{...request.product,photos:undefined},request.size,request.body.measurements,request.fitView,request.textured,request.under&&[request.under.product.id,request.under.size,request.under.textured]]);
// final이 거짓이면 시뮬레이션 중간 모양이다. 법선은 빠른 계산만 하고, 끝난 것으로 표시하지 않는다.
// 핏 보기로 만든 옷(정점 색이 있는 조각)이면 실측 높이(measured) 정점을 시뮬레이션 핏 지도 색으로 바꾼다. 칠했으면 true를 돌려준다.
type Draped={positions:Float32Array[];fit?:Float32Array[]};
function paintSimFit(group:THREE.Object3D,fit:Float32Array[]){
 const meshes:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});let painted=false;
 meshes.forEach((mesh,i)=>{const values=fit[i],color=mesh.geometry.getAttribute('color') as THREE.BufferAttribute|undefined,measured=mesh.geometry.getAttribute('measured');if(!values?.length||!color||!measured)return;for(let v=0;v<measured.count;v++){if(!measured.getX(v))continue;const c=simFitColor(values[v*2],values[v*2+1]);color.setXYZ(v,c.r,c.g,c.b);painted=true;}color.needsUpdate=true;});
 return painted;
}
function applyDrape(group:THREE.Object3D,positions:Float32Array[],final=true){
 const meshes:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
 if(meshes.length!==positions.length||meshes.some((mesh,i)=>mesh.geometry.getAttribute('position').array.length!==positions[i].length))return false;
 meshes.forEach((mesh,i)=>{const attribute=mesh.geometry.getAttribute('position') as THREE.BufferAttribute;(attribute.array as Float32Array).set(positions[i]);attribute.needsUpdate=true;if(final)smoothNormals(mesh.geometry);else{mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();}});
 if(final)group.userData.draped=true;return true;
}

type StageApi={scene:THREE.Scene;camera:THREE.PerspectiveCamera;controls:OrbitControls;avatar:THREE.Group;clothes:THREE.Group;render:()=>void;clearHover:()=>void};

// 피부: 사용자가 고른 피부색에 마네킹 정점 색(입술·눈두덩·볼, generate_avatar_details.py)을 곱한다. 도자기 같은 광택(클리어코트) 대신
// 무광에 가까운 표면과 약한 솜털 광택(sheen)으로 사람 피부처럼 보이게 한다.
function makeSkinMaterial(appearance:Appearance){
 return new THREE.MeshPhysicalMaterial({color:skinColor(appearance),vertexColors:true,roughness:.62,sheen:.3,sheenRoughness:.8,sheenColor:new THREE.Color('#ffd9c9')});
}
function makeHairMaterial(appearance:Appearance){
 const color=new THREE.Color(hairColor(appearance));
 return new THREE.MeshPhysicalMaterial({color,roughness:.55,sheen:.75,sheenRoughness:.45,sheenColor:color.clone().lerp(new THREE.Color('#ffffff'),.3),side:THREE.DoubleSide,normalMap:fabricNormalMap('hair'),normalScale:new THREE.Vector2(.5,.5)});
}
// 눈썹: 얼굴 표면 위에 얹은 얇은 띠. 머리색을 따르되 살짝 옅게(눈썹은 보통 머리카락보다 가늘고 성기다).
function browColor(appearance:Appearance){return new THREE.Color(hairColor(appearance)).lerp(new THREE.Color(skinColor(appearance)),.18);}

// 아바타 뼈대(lib/wardrobe/rig.ts). 몸·눈·눈썹·머리카락·입은 옷이 같은 뼈대를 따라 자세를 잡는다.
// part: 체형 모프를 CPU에서 적용해 화면 좌표의 묶음 자세(A 포즈) 위치를 만드는 부분(몸, 눈, 눈썹).
type RigPart={mesh:THREE.SkinnedMesh;base:Float32Array;targets:Record<string,Float32Array>};
type AvatarRig={bones:RigBone[];objects:THREE.Bone[];skeleton:THREE.Skeleton;body:RigPart;parts:RigPart[];skin:Skin;head:number;joints:Float32Array;bind:Float32Array;key:string};
// 자세를 잡으면 겨드랑이처럼 몸이 부풀거나 접히는 곳에서 피부가 옷을 살짝 뚫고 나올 수 있다. 옷은 화면에 그릴 때만
// 묶음 자세 법선 방향으로 4mm 띄운다(계산·치수는 그대로).
function inflateGarment(material:THREE.Material){
 if(material.userData.inflated)return;material.userData.inflated=true;
 const previous=material.onBeforeCompile.bind(material);
 material.onBeforeCompile=(shader,renderer)=>{previous(shader,renderer);shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n\ttransformed += normal * 0.004;');};
 const key=material.customProgramCacheKey.bind(material);material.customProgramCacheKey=()=>`${key()}|inflate4`;
 material.needsUpdate=true;
}
// 정점 수만큼 한 뼈(bone)를 가중치 1로 따르는 스키닝 속성(눈·눈썹·머리카락은 머리 뼈만 따른다).
function rigidSkin(geometry:THREE.BufferGeometry,bone:number){
 const n=geometry.getAttribute('position').count,index=new Uint16Array(n*4),weight=new Float32Array(n*4);
 for(let i=0;i<n;i++){index[i*4]=bone;weight[i*4]=1;}
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(index,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weight,4));
}
// 움직임 켬/끔은 이 브라우저에 기억한다. 저장값이 없으면 기기의 '동작 줄이기' 설정을 따른다.
const MOTION_KEY='fitroom.motion.v1';
function readMotion(){
 try{const stored=window.localStorage.getItem(MOTION_KEY);if(stored==='1'||stored==='0')return stored==='1';}catch{}
 return typeof window!=='undefined'&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export default function AvatarView({body,outfit,products,storeName,onDrop,onGarmentClick,appearance=DEFAULT_APPEARANCE}:{body:BodyProfile;outfit:Outfit;products:Product[];storeName:string;onDrop:(id:string)=>void;onGarmentClick?:(id:string)=>void;appearance?:Appearance}){
 const host=useRef<HTMLDivElement>(null),api=useRef<StageApi|null>(null);
 const latest=useRef({body,outfit,products,fitView:false,appearance});
 // 마네킹 몸(머리카락을 만들 때 체형 적용 위치를 계산), 피부·눈썹 재질, 머리카락 메시와 그 모양을 정한 입력.
 const mannequin=useRef<MannequinMesh|null>(null),skin=useRef<THREE.MeshPhysicalMaterial|null>(null),brows=useRef<THREE.MeshStandardMaterial|null>(null),hairMesh=useRef<THREE.Mesh|null>(null),hairKey=useRef('');
 const rig=useRef<AvatarRig|null>(null),[motion,setMotion]=useState(true),motionOn=useRef(true);
 // 체형이 바뀌면 몸·눈·눈썹의 묶음 자세(A 포즈) 위치와 관절을 다시 계산하고, 뼈대를 그 자세로 되돌려 묶음 행렬을 새로 잡는다.
 function applyBody(){
  const r=rig.current,mesh=mannequin.current;if(!r||!mesh)return;
  const {body}=latest.current,key=JSON.stringify(body.measurements);if(key===r.key)return;
  const weights=morphWeights(body),frame=morphFrame(mesh,weights,body.measurements.height);
  for(const part of [r.body,...r.parts]){
   const positions=morphPart(part.base,part.targets,weights,frame),geometry=part.mesh.geometry;
   (geometry.getAttribute('position') as THREE.BufferAttribute).copyArray(positions).needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
   if(part===r.body)r.bind=positions;
  }
  r.joints=placeJoints(r.bones,weights,frame);
  r.objects.forEach((bone,i)=>{const p=r.bones[i].parent,j=r.joints;bone.quaternion.identity();bone.position.set(j[i*3]-(p<0?0:j[p*3]),j[i*3+1]-(p<0?0:j[p*3+1]),j[i*3+2]-(p<0?0:j[p*3+2]));});
  r.objects[0].updateMatrixWorld(true);r.skeleton.calculateInverses();r.key=key;
 }
 // 시간 t(초)의 자세로 뼈를 돌린다. 움직임이 꺼져 있으면 가벼운 짝다리로 멈춘 자세.
 function applyPose(t:number){
  const r=rig.current;if(!r)return;
  const pose=avatarPose(r.bones,r.joints,t,motionOn.current);
  r.objects.forEach((bone,i)=>bone.quaternion.copy(pose.rotations[i]));
  r.objects[0].position.set(r.joints[0]+pose.rootOffset.x,r.joints[1]+pose.rootOffset.y,r.joints[2]+pose.rootOffset.z);
 }
 // 옷 조각을 뼈대를 따르는 메시로 바꾼다. 정점마다 가장 가까운 몸 정점들의 뼈 가중치를 받고(천 시뮬레이션은 묶음 자세에서 그대로),
 // 그룹 안 순서를 지켜 처짐 결과(조각 순서대로 정점 위치를 덮어씀)가 그대로 맞게 한다. 이미 바꾼 옷이면 지금 정점 위치
 // (늘어뜨린 결과)로 가중치만 다시 계산한다(천이 처져 내려간 곳은 그 아래 몸 부위를 따르게).
 function skinGarment(group:THREE.Group){
  const r=rig.current;if(!r)return;
  group.updateMatrixWorld(true);
  const meshes:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
  // 모든 조각의 정점을 이어 붙여 한 번에 가중치를 옮기고 섞은 뒤(소매·몸판이 진동 둘레에서 함께 섞이도록) 조각별로 나눈다.
  const counts=meshes.map(m=>m.geometry.getAttribute('position').count),world=new Float32Array(counts.reduce((s,c)=>s+c,0)*3),v=new THREE.Vector3();
  let offset=0;for(const mesh of meshes){const position=mesh.geometry.getAttribute('position');for(let i=0;i<position.count;i++,offset++){v.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);world[offset*3]=v.x;world[offset*3+1]=v.y;world[offset*3+2]=v.z;}}
  const all=garmentSkin(r.bind,r.skin,world,r.bones.length);offset=0;
  for(const [k,mesh] of meshes.entries()){
   const geometry=mesh.geometry,n=counts[k];
   geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(all.index.slice(offset*4,(offset+n)*4),4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(all.weight.slice(offset*4,(offset+n)*4),4));offset+=n;
   if(mesh instanceof THREE.SkinnedMesh)continue;
   (Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(inflateGarment);
   const skinned=new THREE.SkinnedMesh(geometry,mesh.material);
   skinned.name=mesh.name;skinned.castShadow=mesh.castShadow;skinned.receiveShadow=mesh.receiveShadow;skinned.userData=mesh.userData;skinned.frustumCulled=false;
   skinned.position.copy(mesh.position);skinned.quaternion.copy(mesh.quaternion);skinned.scale.copy(mesh.scale);
   const parent=mesh.parent!,at=parent.children.indexOf(mesh);parent.children[at]=skinned;skinned.parent=parent;mesh.parent=null;
   skinned.updateMatrixWorld(true);skinned.bind(r.skeleton,skinned.matrixWorld.clone());
  }
 }
 function updateHair(){
  const a=api.current,mesh=mannequin.current;if(!a||!mesh)return;
  const {body,outfit,appearance}=latest.current,hatWorn=Boolean(outfit.hat),key=JSON.stringify([body.measurements,appearance.hairStyle,hatWorn]);
  brows.current?.color.copy(browColor(appearance));
  if(hairMesh.current){const material=hairMesh.current.material as THREE.MeshPhysicalMaterial,color=new THREE.Color(hairColor(appearance));material.color.copy(color);material.sheenColor.copy(color.clone().lerp(new THREE.Color('#ffffff'),.3));}
  if(key===hairKey.current)return;
  hairKey.current=key;
  if(hairMesh.current){a.scene.remove(hairMesh.current);hairMesh.current.geometry.dispose();(hairMesh.current.material as THREE.Material).dispose();hairMesh.current=null;}
  if(appearance.hairStyle==='none')return;
  // 몸의 묶음 자세(모프 → 키 비율 확대 → 발바닥 0을 CPU에서 적용한 위치)로 머리 모양을 만들고, 머리 뼈를 따르게 한다.
  const r=rig.current,positions=r?.bind??morphedPositions(mesh,morphWeights(body),body.measurements.height),top=body.measurements.height/100;
  const hair=buildHair(positions,mesh.indices,appearance.hairStyle,{hatBase:hatWorn?top-HAT_BASE_DROP:undefined});if(!hair)return;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(hair.positions,3));geometry.setAttribute('uv',new THREE.BufferAttribute(hair.uvs,2));geometry.setIndex(new THREE.BufferAttribute(hair.indices,1));geometry.computeVertexNormals();
  let mesh3:THREE.Mesh;
  if(r){rigidSkin(geometry,r.head);const skinned=new THREE.SkinnedMesh(geometry,makeHairMaterial(appearance));skinned.frustumCulled=false;skinned.bind(r.skeleton,new THREE.Matrix4());mesh3=skinned;}
  else mesh3=new THREE.Mesh(geometry,makeHairMaterial(appearance));
  mesh3.name='hair';mesh3.castShadow=true;mesh3.receiveShadow=true;a.scene.add(mesh3);hairMesh.current=mesh3;
 }
 const clickRef=useRef(onGarmentClick),photoCache=useRef<ReturnType<typeof createPhotoCache>|null>(null);
 const drapeWorker=useRef<Worker|null>(null),drapeCache=useRef(new Map<string,Draped>()),drapePending=useRef(new Set<string>()),drapeTimer=useRef<number|null>(null);
 const [status,setStatus]=useState('loading'),[draping,setDraping]=useState(false),[simLegend,setSimLegend]=useState(false),[drag,setDrag]=useState(false),[view,setView]=useState('정면'),[hoverName,setHoverName]=useState<string|null>(null),[fitView,setFitView]=useState(readFitView);
 // 키·화면 비율이 바뀌면 카메라를 다시 맞춘다(lib/wardrobe/camera.ts). 사용자가 돌려 놓은 방향(수평·수직 각도)과
 // 맞춘 거리 대비 확대 비율은 그대로 두고, 바라보는 높이와 거리만 새 키에 맞춘다.
 const framed=useRef<{height:number;aspect:number;insets:StageInsets;framing:StageFraming}|null>(null);
 // 무대 위 글자·버튼(제목, 시점 버튼 줄)이 아바타 머리·몸통이 있는 가운데 열(폭의 ±13%)을 가리는 위·아래 비율. 데스크톱처럼 옆에 있으면 0이다.
 function stageInsets():StageInsets{
  const canvas=host.current,stage=canvas?.parentElement;if(!canvas||!stage)return {top:0,bottom:0};
  const box=canvas.getBoundingClientRect(),cx=box.left+box.width/2,column=box.width*.13;if(box.height<10)return {top:0,bottom:0};
  let top=0,bottom=0;
  // 제목(h2)은 블록이라 상자가 무대 폭 전체이므로, 실제 글자 줄의 영역으로 잰다.
  const rectsOf=(element:Element)=>{if(element.tagName!=='H2')return [element.getBoundingClientRect()];const range=document.createRange();range.selectNodeContents(element);return Array.from(range.getClientRects());};
  stage.querySelectorAll('.stage-caption h2, .stage-bottom > *').forEach(element=>rectsOf(element).forEach(r=>{
   if(r.width<1||r.height<1||r.right<cx-column||r.left>cx+column)return;
   if(r.top<box.top+box.height/2)top=Math.max(top,(r.bottom-box.top)/box.height);else bottom=Math.max(bottom,(box.bottom-r.top)/box.height);
  }));
  return {top:Math.round(top*100)/100,bottom:Math.round(bottom*100)/100};
 }
 function reframe(){
  const a=api.current;if(!a)return;
  const height=latest.current.body.measurements.height/100,aspect=a.camera.aspect,insets=stageInsets(),previous=framed.current;
  if(previous&&Math.abs(previous.height-height)<1e-4&&Math.abs(previous.aspect-aspect)<1e-3&&previous.insets.top===insets.top&&previous.insets.bottom===insets.bottom)return;
  const f=frameAvatar(height,aspect,a.camera.fov,insets),offset=a.camera.position.clone().sub(a.controls.target);
  const ratio=previous?offset.length()/previous.framing.distance:1,distance=Math.min(f.maxDistance,Math.max(f.minDistance,f.distance*ratio));
  const view=previous?new THREE.Spherical().setFromVector3(offset):new THREE.Spherical(1,Math.acos((f.cameraY-f.targetY)/f.distance),0);
  a.controls.target.set(0,f.targetY,0);a.controls.minDistance=f.minDistance;a.controls.maxDistance=f.maxDistance;
  a.camera.position.copy(a.controls.target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(distance,view.phi,view.theta)));
  framed.current={height,aspect,insets,framing:f};a.controls.update();
 }
 function update(){const a=api.current;if(!a)return;const {body,outfit,products,fitView,appearance}=latest.current;
   // 묶음 자세로 되돌린 뒤(체형이 바뀌었으면 다시 묶고) 머리카락·옷을 만들어 뼈대에 붙이고, 끝에 지금 자세를 준다.
   reframe();applyBody();rig.current?.objects.forEach(bone=>bone.quaternion.identity());
   if(rig.current){const j=rig.current.joints;rig.current.objects[0].position.set(j[0],j[1],j[2]);rig.current.objects[0].updateMatrixWorld(true);}
   skin.current?.color.set(skinColor(appearance));updateHair();
   while(a.clothes.children.length){const item=a.clothes.children[0];a.clothes.remove(item);disposeGroup(item);}
   const requests:DrapeRequest[]=[];let simPainted=false;
   // 사진이 있는 상품은 불러오는 동안에도 사진 모드 조각 구성({})으로 만들어, 사진이 도착해 다시 만들 때 처짐 결과를 그대로 쓴다.
   // 사진 배치를 재지 못했으면(null) 사진 없이 원래 모양으로 그린다. Worker에는 사진 자체를 보내지 않는다.
   const photoFor=(p:Product)=>{const loaded=photos().get(p);return loaded===null?undefined:loaded??(p.photos?{}:undefined);};
   const lean=(p:Product):Product=>({...p,photos:undefined});
   const bottomItem=Object.values(outfit).map(item=>{const p=products.find(product=>product.id===item.productId);const s=p?.sizes.find(candidate=>candidate.label===item.size);return p&&s&&p.slot==='bottom'?{product:lean(p),size:s,textured:Boolean(photoFor(p))}:null;}).find(Boolean)??undefined;
   Object.values(outfit).forEach(item=>{
    const p=products.find(product=>product.id===item.productId);const s=p?.sizes.find(candidate=>candidate.label===item.size);if(!p||!s)return;
    const photo=photoFor(p),fine=p.slot==='top'||p.slot==='bottom',garment=makeGarment(p,s,body,false,{photo,fitView,fine});a.clothes.add(garment);
    if(!fine){skinGarment(garment);return;}
    const request={product:lean(p),size:s,body,fitView,textured:Boolean(photo),under:p.slot==='top'?bottomItem:undefined},key=drapeKey(request),cached=drapeCache.current.get(key);garment.userData.drapeKey=key;
    // 처짐 결과가 있으면 먼저 덮어쓰고 그 위치로 뼈 가중치를 정한다. 없으면 지금 모양으로 정하고, 결과가 오면 다시 정한다.
    const applied=Boolean(cached&&applyDrape(garment,cached.positions));skinGarment(garment);
    if(!applied)requests.push({key,...request});
    else if(fitView&&cached?.fit&&paintSimFit(garment,cached.fit))simPainted=true;
   });
   // 하의를 먼저 보낸다. Worker는 늘어뜨린 하의를 기억해 두었다가 상의를 그 위에 늘어뜨린다.
   setSimLegend(simPainted);
   requestDrape(requests.sort((x,y)=>Number(x.product.slot==='top')-Number(y.product.slot==='top')));applyPose(performance.now()/1000);a.clearHover();a.render();
 }
 // 체형 슬라이더를 움직이는 동안에는 보내지 않고, 0.3초 멈추면 아직 없는 결과만 Worker에 맡긴다.
 // Worker는 3D 화면이 열릴 때 미리 만들어 마네킹을 받아 두게 한다(첫 옷을 입힐 때 기다리는 시간을 줄인다).
 function drapeWorkerReady(){
  if(drapeWorker.current)return drapeWorker.current;
  if(typeof Worker==='undefined')return null;
  try{
   const worker=new Worker(drapeWorkerUrl,{type:'module'});drapeWorker.current=worker;
   worker.onmessage=(event:MessageEvent<DrapeResponse>)=>{
    const response=event.data;
    // 중간 모양: 아직 끝나지 않은 같은 옷에만 바로 그려 옷이 내려앉는 모습을 보여 준다.
    if('positions' in response&&response.partial){const a=api.current;if(!a)return;a.clothes.children.forEach(group=>{if(group.userData.drapeKey===response.key&&!group.userData.draped)applyDrape(group,response.positions,false);});a.render();return;}
    drapePending.current.delete(response.key);setDraping(drapePending.current.size>0);
    if('error' in response){console.warn('옷 처짐 계산 실패',response.error);return;}
    const cache=drapeCache.current;cache.set(response.key,{positions:response.positions,fit:response.fit});while(cache.size>16)cache.delete(cache.keys().next().value!);
    const a=api.current;if(!a)return;
    a.clothes.children.forEach(group=>{
     if(group.userData.drapeKey!==response.key||group.userData.draped||!applyDrape(group,response.positions))return;
     if(group instanceof THREE.Group)skinGarment(group);
     if(latest.current.fitView&&response.fit&&paintSimFit(group,response.fit))setSimLegend(true);
    });a.render();
   };
   worker.onerror=()=>{drapePending.current.clear();setDraping(false);};
   worker.postMessage({warm:true});
   return worker;
  }catch{return null;}
 }
 function requestDrape(requests:DrapeRequest[]){
  if(drapeTimer.current!==null)window.clearTimeout(drapeTimer.current);
  if(!requests.length)return;
  drapeTimer.current=window.setTimeout(()=>{
   drapeTimer.current=null;
   const worker=drapeWorkerReady();if(!worker)return;
   for(const request of requests){if(drapePending.current.has(request.key))continue;drapePending.current.add(request.key);worker.postMessage(request);}
   setDraping(drapePending.current.size>0);
  },300);
 }
 // 상품 사진(앞·뒤)은 처음 쓸 때 불러와 텍스처와 배치를 만들고, 끝나면 옷을 다시 만든다. 그 전에는 색만으로 먼저 보여 준다.
 function photos(){return photoCache.current??=createPhotoCache(()=>update());}
 useEffect(()=>{
   const el=host.current;if(!el)return;let renderer:THREE.WebGLRenderer;const pending=drapePending.current;
   try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{const timer=window.setTimeout(()=>setStatus('error'),0);return()=>window.clearTimeout(timer);}
   renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.setClearColor(0x000000,0);el.appendChild(renderer.domElement);
   const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(STAGE_FOV,1,.01,20);camera.position.set(0,1.05,3.8);addStoreEnvironment(scene);
   // 부드러운 스튜디오 반사광: 원단과 마네킹의 음영이 납작해 보이지 않게 한다.
   const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environment=environment;scene.environmentIntensity=.3;
   const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.87,0);controls.enablePan=false;controls.minDistance=2.0;controls.maxDistance=5;controls.minPolarAngle=.6;controls.maxPolarAngle=1.7;controls.update();
   scene.add(new THREE.HemisphereLight(0xffffff,0xaaaeb3,1.15));
   const key=new THREE.DirectionalLight(0xfff3e8,2.9);key.position.set(-2,4,3);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-2;key.shadow.camera.right=2;key.shadow.camera.top=3;key.shadow.camera.bottom=-1;key.shadow.bias=-.0006;key.shadow.normalBias=.012;key.shadow.radius=4;scene.add(key);
   const fill=new THREE.DirectionalLight(0xe1e6f1,1.4);fill.position.set(3,2,-2);scene.add(fill);
   // 뒤 위쪽에서 비추는 윤곽광: 머리카락과 어깨선이 배경에서 떨어져 보이게 한다.
   const rim=new THREE.DirectionalLight(0xffffff,.9);rim.position.set(0,3,-3);scene.add(rim);
   const platform=new THREE.Mesh(new THREE.CylinderGeometry(.58,.6,.03,72),new THREE.MeshStandardMaterial({color:'#e6e2da',roughness:.55}));platform.position.y=-.015;platform.receiveShadow=true;scene.add(platform);
   const platformRing=new THREE.Mesh(new THREE.TorusGeometry(.586,.004,8,96),new THREE.MeshStandardMaterial({color:'#2557d6',roughness:.4,emissive:'#2557d6',emissiveIntensity:.25}));platformRing.rotation.x=Math.PI/2;platformRing.position.y=.001;scene.add(platformRing);
   const avatar=new THREE.Group(),clothes=new THREE.Group();scene.add(avatar,clothes);
   const render=()=>renderer.render(scene,camera);
   // 입은 옷 위에 커서를 올리면 강조하고, 짧게 클릭하면(회전 드래그가 아닐 때) 그 옷을 벗는다.
   const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let hoverId:string|null=null,downAt:{x:number;y:number;t:number}|null=null;
   const garmentAt=(event:PointerEvent)=>{
     const rect=renderer.domElement.getBoundingClientRect();if(!rect.width||!rect.height||!clothes.children.length)return null;
     pointer.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);
     let node:THREE.Object3D|null=raycaster.intersectObjects(clothes.children,true)[0]?.object??null;while(node&&node.parent!==clothes)node=node.parent;
     return node?node.name:null;
   };
   const setHover=(id:string|null)=>{
     if(id===hoverId)return;hoverId=id;
     clothes.children.forEach(group=>{const on=group.name===id;group.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial){m.emissive.set(on?0x1d3a8a:0x000000);m.emissiveIntensity=on?.5:0;}});});
     renderer.domElement.style.cursor=id?'pointer':'';setHoverName(id?latest.current.products.find(product=>product.id===id)?.name??null:null);render();
   };
   const dom=renderer.domElement;
   const onDown=(event:PointerEvent)=>{downAt={x:event.clientX,y:event.clientY,t:performance.now()};};
   const onUp=(event:PointerEvent)=>{const start=downAt;downAt=null;if(!start||event.button!==0)return;if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>5||performance.now()-start.t>600)return;const id=garmentAt(event);if(id)clickRef.current?.(id);};
   const onMove=(event:PointerEvent)=>{if(event.buttons!==0||event.pointerType==='touch')return;setHover(garmentAt(event));};
   const onLeave=()=>setHover(null);
   dom.addEventListener('pointerdown',onDown);dom.addEventListener('pointerup',onUp);dom.addEventListener('pointermove',onMove);dom.addEventListener('pointerleave',onLeave);
   api.current={scene,camera,controls,avatar,clothes,render,clearHover:()=>setHover(null)};
   drapeWorkerReady();
   const resize=()=>{const w=el.clientWidth,h=el.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();reframe();render();};const observer=new ResizeObserver(resize);observer.observe(el);controls.addEventListener('change',render);resize();
   let disposed=false;new GLTFLoader().load('/models/mannequin.glb',g=>{if(disposed){disposeGroup(g.scene);return;}
     const skinMaterial=makeSkinMaterial(latest.current.appearance);skin.current=skinMaterial;
     const meshes:THREE.Mesh[]=[];g.scene.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
     const source=meshes.find(o=>!/brow|eye/i.test(o.name)),bones=parseRig(source?.userData.rig);
     if(!source||!bones||!source.geometry.getAttribute('skinIndex')){disposeGroup(g.scene);setStatus('error');return;}
     const targetsOf=(o:THREE.Mesh)=>{const dictionary=o.morphTargetDictionary??{},morphs=o.geometry.morphAttributes.position??[];return Object.fromEntries(Object.entries(dictionary).map(([name,index])=>[name,new Float32Array(morphs[index].array)]));};
     mannequin.current={positions:new Float32Array(source.geometry.getAttribute('position').array),indices:new Uint32Array(source.geometry.getIndex()!.array),targets:targetsOf(source),names:Object.keys(source.morphTargetDictionary??{})};
     // 뼈대: 부모가 먼저 오는 순서로 뼈를 잇는다. 뼈 위치는 체형마다 applyBody가 정한다.
     const objects=bones.map(b=>{const bone=new THREE.Bone();bone.name=b.name;return bone;});
     bones.forEach((b,i)=>{if(b.parent>=0)objects[b.parent].add(objects[i]);});
     const skeleton=new THREE.Skeleton(objects),head=boneIndex(bones,'head');avatar.add(objects[0]);
     // 몸은 GLB의 뼈 가중치를, 눈·눈썹은 머리 뼈 하나를 따른다. 체형 모프는 CPU에서 적용하므로 모프 속성은 옮기지 않는다.
     const part=(o:THREE.Mesh,material:THREE.Material,rigid?:number):RigPart=>{
      const src=o.geometry,geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',src.getAttribute('position').clone());
      for(const name of ['color','uv'])if(src.getAttribute(name))geometry.setAttribute(name,src.getAttribute(name));
      const index=src.getIndex();if(index)geometry.setIndex(index);
      if(rigid!==undefined)rigidSkin(geometry,rigid);else{geometry.setAttribute('skinIndex',src.getAttribute('skinIndex'));geometry.setAttribute('skinWeight',src.getAttribute('skinWeight'));}
      const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name=o.name;mesh.frustumCulled=false;mesh.bind(skeleton,new THREE.Matrix4());avatar.add(mesh);
      return {mesh,base:new Float32Array(src.getAttribute('position').array),targets:targetsOf(o)};
     };
     const parts:RigPart[]=[];let bodyPart:RigPart|null=null;
     for(const o of meshes){
      // 눈썹 띠(이름에 eye가 들어가지 않게 먼저 거른다).
      if(/brow/i.test(o.name)){const material=new THREE.MeshStandardMaterial({color:browColor(latest.current.appearance),roughness:.9,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});brows.current=material;const p=part(o,material,head);p.mesh.receiveShadow=true;parts.push(p);continue;}
      // 눈: 흰자·홍채·동공이 정점 색으로 칠해진 구. 젖은 느낌이 나게 매끈한 코팅을 준다.
      if(/eye/i.test(o.name)){parts.push(part(o,new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.12,clearcoat:1,clearcoatRoughness:.05}),head));continue;}
      bodyPart=part(o,skinMaterial);bodyPart.mesh.castShadow=true;bodyPart.mesh.receiveShadow=true;
     }
     const skinIndex=source.geometry.getAttribute('skinIndex'),skinWeight=source.geometry.getAttribute('skinWeight');
     const skinData:Skin={index:Uint16Array.from(skinIndex.array as ArrayLike<number>),weight:Float32Array.from(skinWeight.array as ArrayLike<number>)};
     rig.current={bones,objects,skeleton,body:bodyPart!,parts,skin:skinData,head,joints:new Float32Array(bones.length*3),bind:new Float32Array(0),key:''};
     meshes.forEach(o=>o.geometry.dispose());
     setStatus('ready');update();},undefined,()=>setStatus('error'));
   return()=>{disposed=true;if(drapeTimer.current!==null)window.clearTimeout(drapeTimer.current);drapeWorker.current?.terminate();drapeWorker.current=null;pending.clear();observer.disconnect();dom.removeEventListener('pointerdown',onDown);dom.removeEventListener('pointerup',onUp);dom.removeEventListener('pointermove',onMove);dom.removeEventListener('pointerleave',onLeave);controls.dispose();disposeGroup(scene);photoCache.current?.dispose();photoCache.current=null;environment.dispose();pmrem.dispose();renderer.dispose();renderer.domElement.remove();api.current=null;};
 },[]);
 useEffect(()=>{clickRef.current=onGarmentClick;});
 useEffect(()=>{latest.current={body,outfit,products,fitView,appearance};update();},[body,outfit,products,fitView,appearance]);
 // 저장된 움직임 설정(없으면 기기의 '동작 줄이기')을 화면이 열린 뒤 읽는다(서버 렌더링과 첫 화면을 같게 하려고 처음엔 켬으로 둔다).
 useEffect(()=>{const timer=window.setTimeout(()=>{if(!readMotion())setMotion(false);},0);return()=>window.clearTimeout(timer);},[]);
 // 움직임: 켜져 있으면 약 30fps로 자세를 바꿔 그리고, 탭이 숨겨지면 쉰다. 꺼지면 멈춘 자세로 한 번 그린다.
 useEffect(()=>{
  motionOn.current=motion;
  if(!motion){applyPose(0);api.current?.render();return;}
  let frame=0,last=0;
  const tick=(now:number)=>{frame=requestAnimationFrame(tick);if(document.hidden||now-last<33)return;last=now;const a=api.current;if(!a||!rig.current)return;applyPose(now/1000);a.render();};
  frame=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(frame);
 },[motion]);
 function toggleMotion(){setMotion(on=>{const next=!on;try{window.localStorage.setItem(MOTION_KEY,next?'1':'0');}catch{}return next;});}
 // 정면·옆면·후면: 지금 거리에서 키에 맞춘 높이로 돌아간다. reset이면 거리도 키에 맞춘 기본 거리로 되돌린다(시점 초기화).
 function angle(label:string,r:number,reset=false){
  const a=api.current;if(!a)return;const f=framed.current?.framing;
  const d=reset&&f?f.distance:a.camera.position.distanceTo(a.controls.target),lift=f?f.cameraY-f.targetY:.18,flat=Math.sqrt(Math.max(0,d*d-lift*lift));
  a.camera.position.set(Math.sin(r)*flat,a.controls.target.y+lift,Math.cos(r)*flat);a.controls.update();setView(label);a.render();
 }
 function zoom(f:number){const a=api.current;if(!a)return;const v=a.camera.position.clone().sub(a.controls.target);v.setLength(Math.max(a.controls.minDistance,Math.min(a.controls.maxDistance,v.length()*f)));a.camera.position.copy(a.controls.target).add(v);a.controls.update();a.render();}
 return <div className={`avatar-stage ${drag?'is-dragging':''}`} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDrag(false);}} onDrop={e=>{e.preventDefault();setDrag(false);onDrop(e.dataTransfer.getData('text/plain'));}}>
   <div className="stage-top"><span className="tiny-label">{storeName} · FITTING ROOM</span><div className="stage-top-actions"><span className="stage-badge">{draping?'옷 맵시 계산 중…':'3D · 가상 매장'}</span><button type="button" className={`fit-toggle ${fitView?'active':''}`} aria-pressed={fitView} onClick={()=>setFitView(on=>{writeFitView(!on);return !on;})}><Ruler size={13}/>핏 보기</button></div></div>
   <div className="stage-caption"><h2>매장에서 고른 옷을,<br/>내 아바타에게.</h2><p>상품을 누르거나 끌어다 놓아 입어보고, 입은 옷을 누르면 벗어요.</p></div>
   <div ref={host} className="avatar-canvas" role="img" aria-label="마우스로 회전할 수 있는 내 체형의 3D 아바타. 입은 옷을 누르면 벗을 수 있어요."/>
   {status==='loading'&&<div className="stage-loading"><LoaderCircle className="spin"/> 아바타를 준비하고 있어요</div>}
   {status==='error'&&<div className="stage-loading error">3D 화면을 불러오지 못했어요.<br/>WebGL을 지원하는 브라우저에서 새로고침해 주세요.<br/>상품과 실측 정보는 계속 확인할 수 있어요.</div>}
   {drag&&<div className="drop-message">여기에 놓아 입어보기</div>}
   {fitView&&<div className="fit-legend" role="note" aria-label="핏 보기 색 설명"><strong>{simLegend?'늘어뜨린 옷과 몸 사이':'옷 둘레 − 몸 둘레'}</strong><ul>{(simLegend?FIT_SIM_LEGEND:FIT_LEGEND).map(item=><li key={item.label}><i style={{background:item.color}}/>{item.label}<small>{item.range}</small></li>)}</ul><p>{!Object.keys(outfit).length?'옷을 입히면 높이별 여유가 색으로 보여요.':simLegend?'상품 실측 크기로 늘어뜨린 3D 옷이 몸에서 뜬 거리와 천이 늘어난 정도를, 실측이 있는 높이(상의 가슴·하의 엉덩이)에만 칠한 시뮬레이션 참고 색이에요. 천 무게·뻣뻣함은 측정값이 아니라 실제 착용감과 다를 수 있고, 수치는 아래 실측 비교를 보세요.':'상품 실측이 있는 높이(상의 가슴·하의 엉덩이·모자 머리둘레)만 3D 아바타의 몸 둘레와 비교해 칠한 참고 색이에요. 실제 착용감과 다를 수 있고, 수치는 아래 실측 비교를 보세요.'}</p></div>}
   {hoverName&&!drag&&<div className="garment-hint" role="status"><Shirt size={13}/>{hoverName} · 눌러서 벗기</div>}
   <div className="zoom-controls"><button aria-label="확대" onClick={()=>zoom(.85)}><Plus size={17}/></button><button aria-label="축소" onClick={()=>zoom(1.15)}><Minus size={17}/></button><button aria-label="시점 초기화" onClick={()=>angle('정면',0,true)}><RotateCcw size={16}/></button><button aria-label={motion?'아바타 움직임 멈추기':'아바타 움직임 켜기'} aria-pressed={motion} title={motion?'움직임 멈추기':'움직임 켜기'} onClick={toggleMotion}>{motion?<Pause size={16}/>:<Play size={16}/>}</button></div>
   <div className="stage-bottom"><span className="gesture-hint desktop"><Move size={13}/> 드래그로 회전 · 스크롤로 확대</span><span className="gesture-hint mobile"><Move size={13}/> 손가락으로 회전 · 두 손가락으로 확대</span><div className="view-buttons">{[['정면',0],['옆면',Math.PI/2],['후면',Math.PI]].map(([label,r])=><button key={label} className={view===label?'active':''} onClick={()=>angle(String(label),Number(r))}>{label}</button>)}</div></div>
 </div>;
}
