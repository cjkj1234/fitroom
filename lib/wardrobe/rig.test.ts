import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMannequin,morphFrame,morphPart} from './mannequin-mesh';
import {morphWeights} from './body-shape';
import {DEFAULT_BODY,makePreset} from './body';
import * as THREE from 'three';
import {avatarPose,boneIndex,garmentSkin,parseRig,placeJoints,poseMatrices,skinPositions,transferSkin,type RigBone,type Skin} from './rig';
import {makeGarment,disposeGroup} from './geometry';
import {PRODUCTS} from './catalog';

const glb=readFileSync(new URL('../../public/models/mannequin.glb',import.meta.url));
const jsonLength=glb.readUInt32LE(12),json=JSON.parse(glb.subarray(20,20+jsonLength).toString()),bin=glb.subarray(20+jsonLength+8);
const accessor=(index:number)=>{const a=json.accessors[index],v=json.bufferViews[a.bufferView];return {a,start:(v.byteOffset||0)+(a.byteOffset||0)};};
const prim=json.meshes[0].primitives[0];
const bones=parseRig(json.meshes[0].extras?.rig) as RigBone[];
const mesh=parseMannequin(new Uint8Array(glb));
const skin:Skin=(()=>{
 const j=accessor(prim.attributes.JOINTS_0),w=accessor(prim.attributes.WEIGHTS_0),n=j.a.count,index=new Uint16Array(n*4),weight=new Float32Array(n*4);
 for(let i=0;i<n*4;i++){index[i]=bin[j.start+i];weight[i]=bin.readFloatLE(w.start+i*4);}
 return {index,weight};
})();
const dominant=(i:number)=>{let best=0;for(let c=1;c<4;c++)if(skin.weight[i*4+c]>skin.weight[i*4+best])best=c;return skin.index[i*4+best];};
const BODIES=[DEFAULT_BODY,makePreset(158,'slim'),makePreset(190,'broad'),{...DEFAULT_BODY,measurements:{...DEFAULT_BODY.measurements,height:197}}];

test('마네킹 GLB의 뼈대는 20개(부모가 먼저), 몸 정점마다 뼈 4개 이하·가중치 합 1',()=>{
 assert.ok(bones,'rig');assert.equal(bones.length,20);
 assert.deepEqual(['hips','head','upperarm.L','forearm.R','thigh.L','foot.R'].map(n=>boneIndex(bones,n)>=0),[true,true,true,true,true,true]);
 assert.equal(skin.index.length/4,mesh.positions.length/3);
 for(let i=0;i<skin.index.length/4;i++){
  let sum=0;for(let c=0;c<4;c++){sum+=skin.weight[i*4+c];assert.ok(skin.index[i*4+c]<bones.length);}
  assert.ok(Math.abs(sum-1)<1e-4,`정점 ${i} 가중치 합 ${sum}`);
 }
});

test('체형에 맞춘 관절은 해부학적 높이에 있고 좌우 대칭이며, 다리 길이 모프를 따라 무릎이 움직인다',()=>{
 const at=(joints:Float32Array,name:string)=>{const i=boneIndex(bones,name);return [joints[i*3],joints[i*3+1],joints[i*3+2]];};
 const weights=morphWeights(DEFAULT_BODY),joints=placeJoints(bones,weights,morphFrame(mesh,weights,175));
 const [shoulder,elbow,hip,knee,ankle,head]=['upperarm.L','forearm.L','thigh.L','shin.L','foot.L','head'].map(n=>at(joints,n));
 assert.ok(shoulder[1]>1.35&&shoulder[1]<1.46&&shoulder[0]>.15,`어깨 ${shoulder}`);
 assert.ok(elbow[1]<shoulder[1]&&elbow[1]>1.1,`팔꿈치 ${elbow}`);
 assert.ok(hip[1]>.85&&hip[1]<.95&&knee[1]>.42&&knee[1]<.52&&ankle[1]<.12,`다리 ${hip} ${knee} ${ankle}`);
 assert.ok(head[1]>1.55&&head[1]<1.65,`머리 ${head}`);
 const right=at(joints,'shin.R');assert.ok(Math.abs(right[0]+knee[0])<.002&&Math.abs(right[1]-knee[1])<.002,'좌우 대칭');
 const longLegs={...weights,legLength:1},moved=placeJoints(bones,longLegs,morphFrame(mesh,longLegs,175));
 assert.ok(Math.abs(at(moved,'shin.L')[1]-knee[1])>.01,'다리 길이 모프에 무릎이 따라 움직임');
});

// 체형마다 멈춘 자세와 움직임 여러 순간에 몸을 CPU로 스키닝해 본다.
function posedBodies(){
 const out:Array<{label:string;posed:Float32Array;joints:Float32Array;matrices:ReturnType<typeof poseMatrices>}>=[];
 for(const body of BODIES){
  const weights=morphWeights(body),frame=morphFrame(mesh,weights,body.measurements.height),bind=morphPart(mesh.positions,mesh.targets,weights,frame),joints=placeJoints(bones,weights,frame);
  for(const [motion,t] of [[false,0],[true,0],[true,2.75],[true,5.5],[true,8.25]] as const){
   const pose=avatarPose(bones,joints,t,motion),matrices=poseMatrices(bones,joints,pose);
   out.push({label:`${body.measurements.height}cm ${motion?`움직임 ${t}s`:'멈춤'}`,posed:skinPositions(bind,skin,matrices),joints,matrices});
  }
 }
 return out;
}
const cases=posedBodies();

test('자세를 잡아도 발바닥은 바닥에 닿고(±1.5cm), 정점이 모두 유한하다',()=>{
 for(const {label,posed} of cases){
  let minY=Infinity;for(let i=1;i<posed.length;i+=3)minY=Math.min(minY,posed[i]);
  assert.ok(posed.every(Number.isFinite),label);assert.ok(Math.abs(minY)<.015,`${label}: 가장 낮은 점 ${minY.toFixed(3)}m`);
 }
});

test('내린 팔·손은 몸통을 뚫지 않고, 두 다리는 서로 넘어가지 않는다',()=>{
 const group=(prefixes:string[])=>{const ids=new Set(prefixes.map(n=>boneIndex(bones,n)));return Array.from({length:skin.index.length/4},(_,i)=>i).filter(i=>ids.has(dominant(i)));};
 const torso=group(['hips','spine1','spine2','spine3']),arms={L:group(['forearm.L','hand.L']),R:group(['forearm.R','hand.R'])},legs={L:group(['shin.L','foot.L']),R:group(['shin.R','foot.R'])};
 for(const {label,posed} of cases){
  // 몸통 2cm 높이 띠마다 바깥 끝(|x| 최대).
  const band=new Map<number,number>();for(const i of torso){const b=Math.round(posed[i*3+1]/.02);band.set(b,Math.max(band.get(b)??0,Math.abs(posed[i*3])));}
  for(const side of ['L','R'] as const){
   let inside=0;
   for(const i of arms[side]){const edge=band.get(Math.round(posed[i*3+1]/.02));if(edge!==undefined&&Math.abs(posed[i*3])<edge-.012&&Math.sign(posed[i*3])===(side==='L'?1:-1))inside++;}
   assert.ok(inside<arms[side].length*.01,`${label} ${side} 팔: 몸통 안쪽 정점 ${inside}/${arms[side].length}`);
   const wrongSide=legs[side].filter(i=>posed[i*3]*(side==='L'?1:-1)<0).length;
   assert.equal(wrongSide,0,`${label} ${side} 다리가 가운데를 넘음`);
  }
 }
});

test('옷 정점은 가까운 몸 부위의 뼈를 따른다(뼈 가중치 옮기기)',()=>{
 const weights=morphWeights(DEFAULT_BODY),frame=morphFrame(mesh,weights,175),bind=morphPart(mesh.positions,mesh.targets,weights,frame);
 for(const name of ['forearm.L','thigh.R','head']){
  const id=boneIndex(bones,name),picked:number[]=[];for(let i=0;i<skin.index.length/4&&picked.length<40;i+=7)if(dominant(i)===id&&skin.weight[i*4+skin.index.slice(i*4,i*4+4).indexOf(id)]>.9)picked.push(i);
  assert.ok(picked.length>5,name);
  // 몸 표면에서 바깥으로 1.5cm 떨어진 가짜 옷 정점(뼈 머리에서 멀어지는 방향).
  const head=placeJoints(bones,weights,frame).slice(id*3,id*3+3),targets=new Float32Array(picked.length*3);
  picked.forEach((i,k)=>{const d=[0,1,2].map(c=>bind[i*3+c]-head[c]),len=Math.hypot(...d)||1;for(let c=0;c<3;c++)targets[k*3+c]=bind[i*3+c]+d[c]/len*.015;});
  const moved=transferSkin(bind,skin,targets);
  for(let k=0;k<picked.length;k++){
   let sum=0,best=0;for(let c=0;c<4;c++){sum+=moved.weight[k*4+c];if(moved.weight[k*4+c]>moved.weight[k*4+best])best=c;}
   assert.ok(Math.abs(sum-1)<1e-5);assert.equal(moved.index[k*4+best],id,`${name} 근처 옷 정점`);
  }
 }
});

test('자세를 잡아도 셔츠 진동 둘레(소매와 몸판 이음매)가 벌어지지 않는다',()=>{
 const tee=PRODUCTS.find(p=>p.id==='6170660')!,size=tee.sizes.find(s=>s.label===tee.defaultSize)!;
 for(const body of [DEFAULT_BODY,makePreset(190,'broad')]){
  const weights=morphWeights(body),frame=morphFrame(mesh,weights,body.measurements.height),bind=morphPart(mesh.positions,mesh.targets,weights,frame),joints=placeJoints(bones,weights,frame);
  const group=makeGarment(tee,size,body,false,{fine:true});group.updateMatrixWorld(true);
  const parts:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)parts.push(o);});
  const ranges=new Map<THREE.Mesh,[number,number]>(),points:number[]=[],v=new THREE.Vector3();
  for(const part of parts){const p=part.geometry.getAttribute('position'),start=points.length/3;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(part.matrixWorld);points.push(v.x,v.y,v.z);}ranges.set(part,[start,points.length/3]);}
  const world=Float32Array.from(points),gskin=garmentSkin(bind,skin,world,bones.length);
  const torso=parts.find(p=>p.name==='top-body')!,[t0,t1]=ranges.get(torso)!;
  const seam=parts.filter(p=>p.name==='sleeve').flatMap(p=>{const [s0]=ranges.get(p)!,ring=p.userData.ringSize as number;return Array.from({length:ring},(_,i)=>s0+i);});
  assert.ok(seam.length>40);
  const gap=(positions:Float32Array)=>Math.max(...seam.map(i=>{let best=Infinity;for(let j=t0;j<t1;j++)best=Math.min(best,Math.hypot(positions[i*3]-positions[j*3],positions[i*3+1]-positions[j*3+1],positions[i*3+2]-positions[j*3+2]));return best;}));
  const bindGap=gap(world);
  for(const [motion,t] of [[false,0],[true,3],[true,7]] as const){
   const posed=skinPositions(world,gskin,poseMatrices(bones,joints,avatarPose(bones,joints,t,motion)));
   const g=gap(posed);assert.ok(g<bindGap+.02,`${body.measurements.height}cm ${motion?t+'s':'멈춤'}: 진동 둘레 틈 ${(g*100).toFixed(1)}cm (묶음 자세 ${(bindGap*100).toFixed(1)}cm)`);
  }
  disposeGroup(group);
 }
});
