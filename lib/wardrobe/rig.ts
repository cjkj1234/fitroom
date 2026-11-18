// 아바타 뼈대와 자세. 치수 계산·천 시뮬레이션은 지금처럼 A 포즈 몸으로 하고, 화면에서만 이 뼈대로 자세를 잡는다.
// - 뼈대: generate_rig.py가 마네킹 GLB에 넣은 20개 뼈(MakeHuman 기본 뼈대를 합친 것). 뼈 머리 위치는 체형 모프에 따라 움직인다.
// - 묶음 자세(bind)는 A 포즈이고 모든 뼈의 방향은 회전 없음(세계 축)이다. 그래서 자세는 "부모 기준 회전"만으로 정한다.
// - 옷은 가장 가까운 몸 정점들의 뼈 가중치를 거리로 섞어 받아 몸과 함께 움직인다(transferSkin).
// 좌표는 mannequin-mesh.ts morphedPositions()와 같다(발바닥 y=0, +z 앞, +x 착용자 왼쪽).
import * as THREE from 'three';
import {MORPH_TARGETS,type MorphWeights} from './body-shape';
import type {MorphFrame} from './mannequin-mesh';

export type Vec3=[number,number,number];
export type RigBone={name:string;parent:number;head:Vec3;deltas:Record<string,Vec3>};
// 정점마다 뼈 4개의 번호와 가중치(합 1).
export type Skin={index:Uint16Array;weight:Float32Array};

export function parseRig(value:unknown):RigBone[]|null{
 const bones=(value as {bones?:unknown})?.bones;
 if(!Array.isArray(bones)||!bones.length)return null;
 const ok=bones.every((b,i)=>b&&typeof b.name==='string'&&Number.isInteger(b.parent)&&b.parent<i&&Array.isArray(b.head)&&b.head.length===3&&b.deltas&&typeof b.deltas==='object');
 return ok?bones as RigBone[]:null;
}
export const boneIndex=(bones:RigBone[],name:string)=>bones.findIndex(b=>b.name===name);

// 체형(모프 가중치)과 화면 변환(frame)을 적용한 뼈 머리 위치(뼈마다 x,y,z).
export function placeJoints(bones:RigBone[],weights:Partial<MorphWeights>,frame:MorphFrame){
 const out=new Float32Array(bones.length*3);
 bones.forEach((bone,i)=>{
  const p=[...bone.head];
  for(const name of MORPH_TARGETS){const w=weights[name],d=bone.deltas[name];if(w&&d)for(let c=0;c<3;c++)p[c]+=w*d[c];}
  out[i*3]=p[0]*frame.scale;out[i*3+1]=(p[1]-frame.minY)*frame.scaleY;out[i*3+2]=p[2]*frame.scale;
 });
 return out;
}

// 몸 정점(source, 뼈 가중치 sourceSkin)에서 다른 점들(targets, 옷 정점)로 뼈 가중치를 옮긴다. 가장 가까운 k개 몸 정점의
// 가중치를 거리 제곱의 역수로 섞고, 큰 뼈 4개만 남겨 합을 1로 맞춘다. 3.5cm 격자로 이웃을 찾고, 가까운 k개만 유지한다.
export function transferSkin(source:Float32Array,sourceSkin:Skin,targets:Float32Array,k=4):Skin{
 const cell=.035,key=(x:number,y:number,z:number)=>(x+512)*1048576+(y+512)*1024+(z+512),grid=new Map<number,number[]>();
 for(let i=0;i<source.length/3;i++){const g=key(Math.floor(source[i*3]/cell),Math.floor(source[i*3+1]/cell),Math.floor(source[i*3+2]/cell));let list=grid.get(g);if(!list)grid.set(g,list=[]);list.push(i);}
 const n=targets.length/3,index=new Uint16Array(n*4),weight=new Float32Array(n*4);
 const bestD=new Float64Array(k),bestI=new Int32Array(k),mix=new Float64Array(256);
 for(let t=0;t<n;t++){
  const x=targets[t*3],y=targets[t*3+1],z=targets[t*3+2],cx=Math.floor(x/cell),cy=Math.floor(y/cell),cz=Math.floor(z/cell);
  bestD.fill(Infinity);bestI.fill(-1);
  // 고리(ring)를 한 칸씩 넓히며 그 겉껍질 칸만 본다. k번째 거리가 이미 본 범위(ring×cell) 안이면 멈춘다.
  for(let ring=0;ring<=10;ring++){
   for(let dx=-ring;dx<=ring;dx++)for(let dy=-ring;dy<=ring;dy++)for(let dz=-ring;dz<=ring;dz++){
    if(Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz))!==ring)continue;
    const list=grid.get(key(cx+dx,cy+dy,cz+dz));if(!list)continue;
    for(const i of list){
     const d=(source[i*3]-x)**2+(source[i*3+1]-y)**2+(source[i*3+2]-z)**2;if(d>=bestD[k-1])continue;
     let p=k-1;while(p>0&&bestD[p-1]>d){bestD[p]=bestD[p-1];bestI[p]=bestI[p-1];p--;}bestD[p]=d;bestI[p]=i;
    }
   }
   if(bestI[k-1]>=0&&Math.sqrt(bestD[k-1])<=ring*cell)break;
  }
  mix.fill(0);const used:number[]=[];
  for(let q=0;q<k;q++){const i=bestI[q];if(i<0)continue;const w=1/(bestD[q]+1e-6);for(let c=0;c<4;c++){const b=sourceSkin.index[i*4+c],v=sourceSkin.weight[i*4+c];if(v>0){if(mix[b]===0)used.push(b);mix[b]+=v*w;}}}
  const top=used.sort((a,b)=>mix[b]-mix[a]).slice(0,4),sum=top.reduce((s,b)=>s+mix[b],0)||1;
  top.forEach((b,c)=>{index[t*4+c]=b;weight[t*4+c]=mix[b]/sum;});
  if(!top.length)weight[t*4]=1;
 }
 return {index,weight};
}

// 옷 한 벌 안에서 뼈 가중치를 공간적으로 부드럽게 섞는다. 정점 가중치를 radius/2 크기 격자(복셀)에 모아, 격자끼리 반경 radius
// 가우스로 흐린 뒤 정점은 주변 8개 격자 값을 삼선형 보간해 받는다(정점마다 이웃을 도는 것보다 훨씬 가볍다).
// 소매와 몸판처럼 따로 만든 조각도 진동 둘레에서 서로 가까워 함께 섞이므로, 팔을 내려도 겨드랑이·어깨가 찢어지지 않고
// 팔을 따라 서서히 내려온다.
export function smoothSkin(positions:Float32Array,skin:Skin,boneCount:number,radius=.05):Skin{
 const n=positions.length/3,cell=radius/2,key=(x:number,y:number,z:number)=>(x+512)*1048576+(y+512)*1024+(z+512);
 // 1) 격자마다 가중치 합. 격자 좌표는 칸 가운데가 정수가 되게(정점/칸 − 0.5) 잡아 삼선형 보간과 맞춘다.
 const voxels=new Map<number,number>(),sums:number[]=[],counts:number[]=[];
 const slot=(x:number,y:number,z:number)=>{const k=key(x,y,z);let v=voxels.get(k);if(v===undefined){v=counts.length;voxels.set(k,v);counts.push(0);for(let b=0;b<boneCount;b++)sums.push(0);}return v;};
 for(let i=0;i<n;i++){
  const v=slot(Math.round(positions[i*3]/cell),Math.round(positions[i*3+1]/cell),Math.round(positions[i*3+2]/cell));counts[v]++;
  for(let c=0;c<4;c++)sums[v*boneCount+skin.index[i*4+c]]+=skin.weight[i*4+c];
 }
 // 2) 격자끼리 가우스 흐림(반경 2칸 = radius).
 const coords=[...voxels.keys()].map(k=>[Math.floor(k/1048576)-512,Math.floor(k/1024)%1024-512,k%1024-512]);
 const blurred=new Float32Array(counts.length*boneCount),sigma2=2*(radius/2)**2;
 coords.forEach(([x,y,z],v)=>{
  let total=0;
  for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++){
   const u=voxels.get(key(x+dx,y+dy,z+dz));if(u===undefined)continue;
   const w=Math.exp(-((dx*dx+dy*dy+dz*dz)*cell*cell)/sigma2);total+=w*counts[u];
   for(let b=0;b<boneCount;b++)blurred[v*boneCount+b]+=w*sums[u*boneCount+b];
  }
  if(total>0)for(let b=0;b<boneCount;b++)blurred[v*boneCount+b]/=total;
 });
 // 3) 정점마다 주변 8개 격자의 삼선형 보간(없는 격자는 빼고 다시 나눈다). 뼈 4개만 남겨 합을 1로.
 const index=new Uint16Array(n*4),weight=new Float32Array(n*4),mixed=new Float32Array(boneCount);
 for(let i=0;i<n;i++){
  const fx=positions[i*3]/cell,fy=positions[i*3+1]/cell,fz=positions[i*3+2]/cell,x0=Math.floor(fx),y0=Math.floor(fy),z0=Math.floor(fz);
  mixed.fill(0);let total=0;
  for(let c=0;c<8;c++){
   const x=x0+(c&1),y=y0+((c>>1)&1),z=z0+((c>>2)&1),u=voxels.get(key(x,y,z));if(u===undefined)continue;
   const w=(1-Math.abs(fx-x))*(1-Math.abs(fy-y))*(1-Math.abs(fz-z));if(w<=0)continue;total+=w;
   for(let b=0;b<boneCount;b++)mixed[b]+=w*blurred[u*boneCount+b];
  }
  if(total<=0){for(let c=0;c<4;c++){index[i*4+c]=skin.index[i*4+c];weight[i*4+c]=skin.weight[i*4+c];}continue;}
  const top=Array.from(mixed,(v,b)=>[b,v] as const).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((s,[,v])=>s+v,0)||1;
  top.forEach(([b,v],c)=>{index[i*4+c]=b;weight[i*4+c]=v/sum;});
 }
 return {index,weight};
}

// 옷 한 벌(모든 조각의 묶음 자세 위치를 이어 붙인 것)의 뼈 가중치: 몸에서 옮긴 뒤 옷 안에서 부드럽게 섞는다.
export function garmentSkin(bodyBind:Float32Array,bodySkin:Skin,garment:Float32Array,boneCount:number):Skin{
 return smoothSkin(garment,transferSkin(bodyBind,bodySkin,garment),boneCount);
}

// ---------------------------------------------------------------- 자세
export type Pose={rotations:THREE.Quaternion[];rootOffset:THREE.Vector3};
const deg=Math.PI/180;
const euler=(x:number,y:number,z:number)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(x*deg,y*deg,z*deg,'YXZ'));
// 아래쪽(−y)에서 바깥(+x 쪽, side로 좌우)으로 out도, 앞(+z)으로 forward도 기운 방향.
const hang=(side:number,out:number,forward:number)=>new THREE.Vector3(side*Math.sin(out*deg),-Math.cos(out*deg)*Math.cos(forward*deg),Math.cos(out*deg)*Math.sin(forward*deg)).normalize();
// 머무는 시간이 긴 물결(-1~1): 양 끝에서 천천히 머물다 넘어간다.
const linger=(phase:number)=>{const s=Math.sin(phase*Math.PI*2);return Math.sign(s)*Math.pow(Math.abs(s),.55);};

// 시간 t(초)의 자세. motion이 거짓이면 가벼운 짝다리로 멈춘 자세다. joints: placeJoints 결과(묶음 자세의 뼈 머리 위치).
// - 팔: A 포즈에서 내려 몸 옆 13°, 아래팔은 바깥 9°·앞 6°로 손이 허벅지 옆에 오게 한다. 숨쉬기·체중 이동에 따라 조금 흔들린다.
// - 다리: 벌어진 A 포즈에서 모아 발을 엉덩이 너비로 두고, 체중을 싣지 않은 다리는 무릎을 살짝 굽힌다.
// - 엉덩이는 체중을 실은 다리 쪽으로 옮기며 기울고, 척추·머리는 반대로 기울어 균형을 잡는다(콘트라포스토).
// - 체중을 실은 발이 바닥(묶음 자세의 발목 높이)에 닿도록 몸 전체 높이를 맞추고, 발은 바닥과 평행하게 둔다.
export function avatarPose(bones:RigBone[],joints:Float32Array,t:number,motion:boolean):Pose{
 const n=bones.length,local=Array.from({length:n},()=>new THREE.Quaternion()),at=(name:string)=>boneIndex(bones,name);
 const head=(i:number)=>new THREE.Vector3(joints[i*3],joints[i*3+1],joints[i*3+2]);
 const shift=motion?.6*linger(t/11):.35,breathe=motion?Math.sin(t/4.4*Math.PI*2):0,look=motion?Math.sin(t/13*Math.PI*2+1):0;
 const nod=motion?Math.sin(t/7.3*Math.PI*2):0,sway=motion?Math.sin(t/5.5*Math.PI*2+.7):0;
 const loadLeft=Math.min(1,Math.max(0,.5+.5*shift)),load:Record<'L'|'R',number>={L:loadLeft,R:1-loadLeft};
 const set=(name:string,q:THREE.Quaternion)=>{const i=at(name);if(i>=0)local[i].copy(q);};
 set('hips',euler(0,0,2.6*shift));
 set('spine1',euler(0,0,-1*shift));
 set('spine2',euler(-.3*breathe,0,-1.2*shift));
 set('spine3',euler(-.6*breathe,1.2*look,-.6*shift));
 set('neck',euler(1*nod,2*look,.6*shift));
 set('head',euler(1.2*nod,4*look,1.2*shift));
 for(const side of ['L','R'] as const)set(`clavicle.${side}`,euler(0,0,(side==='L'?1:-1)*.5*breathe));
 // 세계 회전을 차례로 쌓으며, 팔·다리는 원하는 방향을 바라보게 부모 기준 회전을 정한다.
 const world=Array.from({length:n},()=>new THREE.Quaternion());
 const settle=(i:number)=>{const p=bones[i].parent;world[i].copy(p<0?local[i]:world[p].clone().multiply(local[i]));};
 const aim=(name:string,child:string,dir:THREE.Vector3)=>{
  const i=at(name),c=at(child);if(i<0||c<0)return;
  const bind=head(c).sub(head(i)).normalize(),parent=bones[i].parent<0?new THREE.Quaternion():world[bones[i].parent];
  local[i].setFromUnitVectors(bind,dir.clone().applyQuaternion(parent.clone().invert()));
 };
 for(let i=0;i<n;i++){
  const name=bones[i].name,side=name.endsWith('.L')?1:-1,s=name.endsWith('.L')?'L':'R',free=1-load[s as 'L'|'R'];
  if(name.startsWith('upperarm.'))aim(name,`forearm.${s}`,hang(side,13+.8*breathe+1.5*free,2+2*sway*side));
  else if(name.startsWith('forearm.'))aim(name,`hand.${s}`,hang(side,9,6+3*sway*side));
  else if(name.startsWith('thigh.'))aim(name,`shin.${s}`,hang(side,3.5-1.5*free,7*free));
  else if(name.startsWith('shin.'))aim(name,`foot.${s}`,hang(side,2,-5*free));
  settle(i);
  // 발은 바닥과 평행: 부모까지 쌓인 회전을 되돌린다.
  if(name.startsWith('foot.')){const p=bones[i].parent;local[i].copy(world[p].clone().invert());settle(i);}
 }
 // 앞 운동학으로 발목 높이를 구해, 낮은 쪽 발목이 묶음 자세 발목 높이에 오도록 몸 전체를 올리거나 내린다.
 const position=Array.from({length:n},()=>new THREE.Vector3());
 for(let i=0;i<n;i++){const p=bones[i].parent;position[i]=p<0?head(i):position[p].clone().add(head(i).sub(head(p)).applyQuaternion(world[p]));}
 const feet=['foot.L','foot.R'].map(at).filter(i=>i>=0),bindAnkle=Math.min(...feet.map(i=>joints[i*3+1])),ankle=Math.min(...feet.map(i=>position[i].y));
 const hips=at('hips'),rootOffset=new THREE.Vector3(.018*shift*(hips>=0?1:0),bindAnkle-ankle,0);
 return {rotations:local,rootOffset};
}

// 자세를 준 뼈마다의 변환 행렬(묶음 자세 → 자세). 정점은 Σ 가중치 × 행렬 × 묶음 위치로 옮겨진다(선형 블렌드 스키닝).
export function poseMatrices(bones:RigBone[],joints:Float32Array,pose:Pose){
 const n=bones.length,world=Array.from({length:n},()=>new THREE.Matrix4()),out:THREE.Matrix4[]=[];
 for(let i=0;i<n;i++){
  const p=bones[i].parent,h=new THREE.Vector3(joints[i*3],joints[i*3+1],joints[i*3+2]);
  const offset=p<0?h.clone().add(pose.rootOffset):h.clone().sub(new THREE.Vector3(joints[p*3],joints[p*3+1],joints[p*3+2]));
  const m=new THREE.Matrix4().compose(offset,pose.rotations[i],new THREE.Vector3(1,1,1));
  world[i]=p<0?m:world[p].clone().multiply(m);
  out.push(world[i].clone().multiply(new THREE.Matrix4().makeTranslation(-h.x,-h.y,-h.z)));
 }
 return out;
}
// CPU 스키닝(테스트·검사용). 화면에서는 three.js SkinnedMesh가 같은 계산을 GPU에서 한다.
export function skinPositions(positions:Float32Array,skin:Skin,matrices:THREE.Matrix4[]){
 const out=new Float32Array(positions.length),v=new THREE.Vector3(),acc=new THREE.Vector3(),tmp=new THREE.Vector3();
 for(let i=0;i<positions.length/3;i++){
  v.set(positions[i*3],positions[i*3+1],positions[i*3+2]);acc.set(0,0,0);
  for(let c=0;c<4;c++){const w=skin.weight[i*4+c];if(w>0)acc.addScaledVector(tmp.copy(v).applyMatrix4(matrices[skin.index[i*4+c]]),w);}
  out[i*3]=acc.x;out[i*3+1]=acc.y;out[i*3+2]=acc.z;
 }
 return out;
}
