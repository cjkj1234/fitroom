import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {PRODUCTS} from './catalog';
import {DEFAULT_BODY,makePreset} from './body';
import {bodyShape} from './body-shape';
import {makeGarment,disposeGroup} from './geometry';
import {bodyPositions,parseMannequin} from './mannequin-mesh';
import {buildBodySdf,sampleSdf} from './body-sdf';
import {drapeBottom,drapeTop} from './drape';
import type {BodyProfile} from './types';

// 천 처짐 시뮬레이션: 몸 거리장이 정확한지, 늘어뜨린 상의가 몸·바지를 뚫지 않고 어깨에 걸치는지 검사한다.
const mesh=parseMannequin(new Uint8Array(readFileSync(new URL('../../public/models/mannequin.glb',import.meta.url))));
const tee=PRODUCTS.find(item=>item.id==='6170660')!,pants=PRODUCTS.find(item=>item.slot==='bottom')!;
const pantsSize=pants.sizes.find(size=>size.label===pants.defaultSize)!;
// 상의는 늘어뜨린 바지 위에 늘어뜨린다(화면의 Worker와 같은 순서).
function drapedPants(body:BodyProfile){const group=makeGarment(pants,pantsSize,body,false,{fine:true});drapeBottom(group,mesh,body);const positions:Float32Array[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)positions.push(new Float32Array(o.geometry.getAttribute('position').array));});return {group,positions};}

test('몸 거리장은 마네킹 표면에서 0에 가깝고, 표면 밖은 양수·안은 음수다',()=>{
 const positions=bodyPositions(mesh,DEFAULT_BODY),sdf=buildBodySdf([{positions,indices:mesh.indices}],{min:[-.45,.75,-.2],max:[.45,1.62,.3]});
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(Array.from(mesh.indices));geometry.computeVertexNormals();
 const normal=geometry.getAttribute('normal'),out=[0,0,0,0];let count=0,sum=0,wrongSign=0;
 for(let i=0;i<positions.length/3;i+=3){
  const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2];if(y<.78||y>1.6||Math.abs(x)>.43||z<-.18||z>.28)continue;
  sampleSdf(sdf,x,y,z,out);sum+=Math.abs(out[0]);count++;
  const nx=normal.getX(i),ny=normal.getY(i),nz=normal.getZ(i);
  if(sampleSdf(sdf,x+nx*.005,y+ny*.005,z+nz*.005,out)[0]<=0)wrongSign++;
  if(sampleSdf(sdf,x-nx*.005,y-ny*.005,z-nz*.005,out)[0]>=0)wrongSign++;
 }
 assert.ok(count>1000,`검사 정점 ${count}`);
 assert.ok(sum/count<.001,`표면 평균 |거리| ${(sum/count*1000).toFixed(2)}mm`);
 // 겨드랑이·손가락 사이처럼 5mm 안에 다른 표면이 있는 곳은 부호가 바뀔 수 있어 2%까지 허용한다(측정 1.1%).
 assert.ok(wrongSign/(count*2)<.02,`표면 5mm 안팎 부호 오류 ${wrongSign}/${count*2}`);
});

// 몸 정점에서 표면 법선 방향으로 reach 안에 옷이 없으면 드러난 것으로 센다. 넉넉한 옷은 몸에서 멀리 떨어져 늘어지므로 몸통은 30cm까지 본다.
function exposedAlongNormals(group:THREE.Group,body:BodyProfile,region:(p:THREE.Vector3,k:number)=>boolean,reach=.06){
 const positions=bodyPositions(mesh,body),k=body.measurements.height/175,geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(Array.from(mesh.indices));geometry.computeVertexNormals();
 const normal=geometry.getAttribute('normal'),meshes:THREE.Mesh[]=[];group.updateMatrixWorld(true);group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
 const raycaster=new THREE.Raycaster();raycaster.far=reach;let tested=0,exposed=0;
 for(let i=0;i<positions.length/3;i++){
  const p=new THREE.Vector3(positions[i*3],positions[i*3+1],positions[i*3+2]);if(!region(p,k))continue;
  tested++;raycaster.set(p,new THREE.Vector3(normal.getX(i),normal.getY(i),normal.getZ(i)));if(raycaster.intersectObjects(meshes,false).length===0)exposed++;
 }
 return {tested,exposed,share:exposed/Math.max(1,tested)};
}

for(const [name,body] of [['기본 체형',DEFAULT_BODY],['185 큰 체형',makePreset(185,'broad')]] as Array<[string,BodyProfile]>){
 test(`${name}: 바지 위에 늘어뜨린 상의는 어깨에 걸치고 몸·바지를 뚫지 않는다`,t=>{
  const size=tee.sizes.find(item=>item.label===tee.defaultSize)!,group=makeGarment(tee,size,body,false,{fine:true}),k=body.measurements.height/175,shape=bodyShape(body);
  const panel=group.getObjectByName('top-body') as THREE.Mesh,position=panel.geometry.getAttribute('position'),last=position.count-113;
  const neckBefore=Array.from({length:113},(_,i)=>position.getY(last+i)).reduce((a,b)=>a+b,0)/113;
  const pantsDraped=drapedPants(body),result=drapeTop(group,mesh,body,{product:pants,size:pantsSize,positions:pantsDraped.positions})!;
  t.diagnostic(`${result.ms}ms, 입자 ${result.particles}, 평균 늘어남 ${(result.strainMean*100).toFixed(1)}%`);
  group.traverse(o=>{if(o instanceof THREE.Mesh)assert.ok(Array.from(o.geometry.getAttribute('position').array).every(Number.isFinite),`${o.name} 좌표`);});
  assert.ok(result.strainMean<.04,`평균 늘어남 ${(result.strainMean*100).toFixed(1)}%`);
  // 목선은 목 옆 점에서 크게 미끄러지지 않는다(앞이 처지는 정도까지만).
  const neckAfter=Array.from({length:113},(_,i)=>position.getY(last+i)).reduce((a,b)=>a+b,0)/113;
  assert.ok(neckBefore-neckAfter<.025,`목선 평균 높이 ${(neckBefore*100).toFixed(1)}→${(neckAfter*100).toFixed(1)}cm`);
  // 어깨 꼭대기(목과 팔 사이)와 몸통(겨드랑이 아래~엉덩이 위)이 드러나지 않는다.
  const shoulders=exposedAlongNormals(group,body,(p,k)=>p.y>1.36*k&&p.y<1.455*k&&Math.abs(p.x)>.1*k&&Math.abs(p.x)<.25*k);
  const torso=exposedAlongNormals(group,body,(p,k)=>{const s=shape.torso(p.y);return p.y>1.02*k&&p.y<1.3*k&&s!==null&&Math.abs(p.x)<=s.rx+.005;},.3);
  t.diagnostic(`어깨 노출 ${shoulders.exposed}/${shoulders.tested}, 몸통 노출 ${torso.exposed}/${torso.tested}`);
  // 측정: 기본 체형 0%, 185 큰 체형 2.0%(소매와 몸판이 만나는 진동 앞쪽의 몇 점). 허용은 3%.
  assert.ok(shoulders.tested>100&&shoulders.share<=.03,`어깨 노출 ${(shoulders.share*100).toFixed(1)}%`);
  assert.ok(torso.tested>500&&torso.share<=.02,`몸통 노출 ${(torso.share*100).toFixed(1)}%`);
  // 상의 입자는 늘어뜨린 바지 안으로 들어가지 않는다.
  const bottom=pantsDraped.group,seat=bottom.getObjectByName('bottom-body') as THREE.Mesh;
  const seatSdf=buildBodySdf([{positions:new Float32Array(seat.geometry.getAttribute('position').array),indices:Uint32Array.from(seat.geometry.getIndex()!.array)}],{min:[-.4,.7*k,-.3],max:[.4,1.1*k,.35]});
  const out=[0,0,0,0];let inside=0;for(let i=0;i<position.count;i++)if(sampleSdf(seatSdf,position.getX(i),position.getY(i),position.getZ(i),out)[0]<-.002)inside++;
  assert.ok(inside/position.count<.005,`바지 안으로 들어간 상의 정점 ${inside}/${position.count}`);
  disposeGroup(group);disposeGroup(bottom);
 });
}

// 바지: 허리는 고정되고, 다리는 늘어져 바닥에서 멈추며, 몸을 뚫지 않고 엉덩이·다리를 덮는다.
const BOTTOM_CASES:Array<[string,BodyProfile,string]>=[['기본 체형',DEFAULT_BODY,'3504218'],['기본 체형',DEFAULT_BODY,'5196637'],['185 큰 체형',makePreset(185,'broad'),'3547134']];
for(const [name,body,id] of BOTTOM_CASES){
 const product=PRODUCTS.find(item=>item.id===id)!;
 test(`${name}: ${product.name}은 허리에 걸려 늘어지고 바닥에서 멈추며 몸을 뚫지 않는다`,t=>{
  const size=product.sizes.find(item=>item.label===product.defaultSize)!,group=makeGarment(product,size,body,false,{fine:true}),k=body.measurements.height/175;
  const panel=group.getObjectByName('bottom-body') as THREE.Mesh,position=panel.geometry.getAttribute('position'),[pinFrom,pinTo]=panel.userData.pinned as [number,number];
  const waistBefore=Float32Array.from({length:(pinTo-pinFrom)*3},(_,i)=>position.array[pinFrom*3+i]);
  // 밑위 곡선(몸 가운데 x≈0, 0.5~0.9m)의 가장 낮은 점: 허리 끈(long range attachment)이 있으면 처음 높이에서 크게 처지지 않는다.
  const crotchLow=()=>{let low=Infinity;for(let i=0;i<position.count;i++)if(Math.abs(position.getX(i))<.003&&position.getY(i)>.5*k&&position.getY(i)<.9*k)low=Math.min(low,position.getY(i));return low;},crotchBefore=crotchLow();
  const result=drapeBottom(group,mesh,body)!;
  t.diagnostic(`${result.ms}ms, 입자 ${result.particles}, 평균 늘어남 ${(result.strainMean*100).toFixed(1)}%`);
  group.traverse(o=>{if(o instanceof THREE.Mesh)assert.ok(Array.from(o.geometry.getAttribute('position').array).every(Number.isFinite),`${o.name} 좌표`);});
  assert.ok(result.strainMean<.03,`평균 늘어남 ${(result.strainMean*100).toFixed(1)}%`);
  assert.ok(crotchBefore-crotchLow()<.03,`가랑이 처짐 ${((crotchBefore-crotchLow())*100).toFixed(1)}cm`);
  for(let i=0;i<waistBefore.length;i++)assert.equal(position.array[pinFrom*3+i],waistBefore[i],'허리밴드 높이 고리는 고정');
  let lowest=Infinity;for(let i=0;i<position.count;i++)lowest=Math.min(lowest,position.getY(i));
  assert.ok(lowest>=-.001,`가장 낮은 점 ${(lowest*100).toFixed(1)}cm (바닥 0)`);
  // 몸 안으로 2mm 넘게 들어간 바지 입자.
  const bodySdf=buildBodySdf([{positions:bodyPositions(mesh,body),indices:mesh.indices}],{min:[-.5,-.02,-.3],max:[.5,1.2*k,.4]}),out=[0,0,0,0];
  let inside=0;for(let i=0;i<position.count;i++)if(sampleSdf(bodySdf,position.getX(i),position.getY(i),position.getZ(i),out)[0]<-.002)inside++;
  assert.ok(inside/position.count<.005,`몸 안으로 들어간 바지 정점 ${inside}/${position.count}`);
  // 엉덩이·다리(밑단 8cm 위~허리 5cm 아래)가 법선 방향 30cm 안에서 바지에 덮인다. 가랑이 맨 아래는 두 다리 사이 틈으로 빠지는 광선이 있어 2%까지 허용한다.
  const hemY=(body.measurements.legLength-(size.length??105))/100;
  const covered=exposedAlongNormals(group,body,p=>p.y>Math.max(.08,hemY+.08)&&p.y<body.measurements.legLength/100-.05&&Math.abs(p.x)<.3*k,.3);
  t.diagnostic(`엉덩이·다리 노출 ${covered.exposed}/${covered.tested}`);
  assert.ok(covered.tested>800&&covered.share<=.02,`엉덩이·다리 노출 ${(covered.share*100).toFixed(1)}%`);
  disposeGroup(group);
 });
}

// 핏 지도: 상품 실측 크기로 늘어뜨리므로, 몸보다 작은 옷은 가슴 띠가 몸에 닿아 늘어나고(끼임), 큰 옷은 몸에서 뜬다.
test('작은 상의는 가슴 띠가 몸에 닿아 늘어나고, 넉넉한 상의는 몸에서 떠 핏 지도가 다르게 나온다',t=>{
 const summary=(chestFlat:number)=>{
  const size={...tee.sizes.find(item=>item.label===tee.defaultSize)!,chestFlat},group=makeGarment(tee,size,DEFAULT_BODY,false,{fine:true});
  drapeTop(group,mesh,DEFAULT_BODY);
  const panel=group.getObjectByName('top-body') as THREE.Mesh,measured=panel.geometry.getAttribute('measured'),fit=panel.userData.fit as Float32Array;
  let count=0,tight=0,gap=0;for(let i=0;i<measured.count;i++){if(!measured.getX(i))continue;count++;gap+=fit[i*2];if(fit[i*2]<.005&&fit[i*2+1]>.03)tight++;}
  disposeGroup(group);return {count,tight:tight/count,gap:gap/count};
 };
 // 기본 체형 가슴 96cm: 가슴단면 42(둘레 84cm)는 12cm 작고, 60(120cm)은 24cm 크다.
 const small=summary(42),roomy=summary(60);
 t.diagnostic(`작은 옷 끼임 ${(small.tight*100).toFixed(0)}%·평균 틈 ${(small.gap*100).toFixed(1)}cm, 넉넉한 옷 끼임 ${(roomy.tight*100).toFixed(0)}%·평균 틈 ${(roomy.gap*100).toFixed(1)}cm`);
 assert.ok(small.count>100&&roomy.count>100,'가슴 띠 실측 정점');
 assert.ok(small.tight>.4,`작은 옷의 끼임 비율 ${small.tight}`);
 assert.ok(roomy.tight<.05,`넉넉한 옷의 끼임 비율 ${roomy.tight}`);
 assert.ok(roomy.gap>small.gap+.01,`넉넉한 옷이 더 뜬다 ${roomy.gap} > ${small.gap}`);
});
