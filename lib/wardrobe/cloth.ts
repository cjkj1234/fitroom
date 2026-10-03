// 옷 처짐(드레이프) 시뮬레이션. 절차형으로 만든 상의를 처음 모양(쉬는 길이)으로 삼아, 중력에 따라 늘어뜨리고 몸(부호 있는 거리장)에
// 부딪히게 해 어깨·가슴에 걸치고 남는 천이 처지며 주름이 지게 한다. 방법은 작은 시간 단계를 여러 번 도는 XPBD
// (Macklin et al., "Small Steps in Physics Simulation", 2019)이고, 천끼리의 충돌은 계산하지 않는다.
// 천 물성(무게·뻣뻣함)은 측정값이 아니라 면 저지에 가깝게 고른 값이다.
import * as THREE from 'three';
import {sampleSdf,type BodySdf,type Bounds} from './body-sdf';

export type DrapeSettings={
 seconds:number;// 시뮬레이션할 시간(s)
 steps:number;// 1초당 작은 단계 수
 thickness:number;// 몸 표면에서 천까지 남길 거리(m)
 bend:number;// 굽힘 저항: 한 단계에 굽힘 오차를 되돌리는 비율(0~1). 작을수록 잘 접힌다
 friction:number;// 몸과의 마찰 계수
 damping:number;// 속도 감쇠(1/s)
 iterations:number;// 한 단계에서 늘어남 제약을 푸는 횟수
 settle:number;// 처음 이 비율의 시간 동안 어깨 위쪽(옷 그룹의 userData.yokeFrom 위)은 눌린 만큼 쉬는 길이를 줄여 몸에 맞춘다
 shrink:number;// 그때 쉬는 길이를 줄일 수 있는 한도(처음 길이에 대한 비율)
 floor:number;// 바닥 높이(m). 긴 바지 밑단이 바닥에 닿아 쌓인다
};
export const DRAPE_DEFAULTS:DrapeSettings={seconds:.6,steps:600,thickness:.003,bend:.004,friction:.6,damping:3,iterations:3,settle:.4,shrink:.7,floor:0};
// 바지: 면 능직·데님처럼 저지보다 뻣뻣하게(굽힘 비율 3배) 하고, 허리는 고정하므로 어깨 맞춤은 쓰지 않는다.
export const DRAPE_BOTTOM:DrapeSettings={...DRAPE_DEFAULTS,bend:.012,settle:0};
// 시뮬레이션하는 옷 조각의 이름. 나머지 조각(밑단·카라·단추·주머니·사진 앞면 등)은 가장 가까운 천 삼각형에 붙여 따라 움직인다.
export const CLOTH_PARTS=['top-body','sleeve','bottom-body'];
// 덧붙은 조각을 붙일 큰 천 조각(몸판). 소매단 띠('cuff')만 소매에 붙인다.
const PANELS=['top-body','bottom-body'];

type Binding={mesh:THREE.Mesh;triangle:Int32Array;weights:Float32Array;triangles:number[]};

// 옷 그룹 안 시뮬레이션 조각의 범위(거리장 격자를 만들 때 쓴다). margin만큼 넓힌다.
export function clothBounds(group:THREE.Group,margin=.06):Bounds|null{
 group.updateMatrixWorld(true);const box=new THREE.Box3();let found=false;
 group.traverse(o=>{if(o instanceof THREE.Mesh&&CLOTH_PARTS.includes(o.name)){box.expandByObject(o);found=true;}});
 if(!found)return null;
 return {min:[box.min.x-margin,box.min.y-margin,box.min.z-margin],max:[box.max.x+margin,box.max.y+margin,box.max.z+margin]};
}

// onProgress: 시뮬레이션 중간 모양을 보여 주고 싶을 때. progressEvery 단계마다 지금 모양을 옷 조각에 써 넣은 뒤 진행률(0~1)과 함께 부른다.
export function drapeGarment(group:THREE.Group,sdf:BodySdf,settings:DrapeSettings=DRAPE_DEFAULTS,onProgress?:(done:number)=>void,progressEvery=30){
 const started=Date.now();
 group.updateMatrixWorld(true);
 const parts:THREE.Mesh[]=[],others:THREE.Mesh[]=[];
 group.traverse(o=>{if(o instanceof THREE.Mesh)(CLOTH_PARTS.includes(o.name)?parts:others).push(o);});
 if(!parts.length)return null;
 // 1) 입자: 조각마다 같은 위치의 정점(고리의 시작·끝)을 하나로 합친다. 소매와 몸판은 따로 두고 아래 바느질 제약으로 잇는다.
 const xs:number[]=[],vertexParticle:Int32Array[]=[],triangles:number[]=[],partStart:number[]=[];
 for(const mesh of parts){
  const position=mesh.geometry.getAttribute('position'),index=mesh.geometry.getIndex()!,map=new Int32Array(position.count),seen=new Map<string,number>();
  partStart.push(xs.length/3);
  for(let i=0;i<position.count;i++){
   const x=position.getX(i),y=position.getY(i),z=position.getZ(i),key=`${Math.round(x*1e5)},${Math.round(y*1e5)},${Math.round(z*1e5)}`;
   let id=seen.get(key);if(id===undefined){id=xs.length/3;xs.push(x,y,z);seen.set(key,id);}map[i]=id;
  }
  vertexParticle.push(map);
  for(let t=0;t<index.count;t+=3){const a=map[index.getX(t)],b=map[index.getX(t+1)],c=map[index.getX(t+2)];if(a!==b&&b!==c&&a!==c)triangles.push(a,b,c);}
 }
 const n=xs.length/3,x=new Float64Array(xs),previous=new Float64Array(n*3),velocity=new Float64Array(n*3);
 // 고정 입자(바지 허리밴드 높이 고리 등, 조각의 userData.pinned=[시작, 끝) 정점 범위)는 질량을 무한대(역질량 0)로 둔다.
 const inverseMass=new Float64Array(n).fill(1);
 parts.forEach((mesh,p)=>{const pinned=mesh.userData.pinned as [number,number]|undefined;if(pinned)for(let i=pinned[0];i<pinned[1];i++)inverseMass[vertexParticle[p][i]]=0;});
 // 2) 제약: 삼각형 모서리는 늘어나지 않게(쉬는 길이 유지), 모서리를 공유하는 두 삼각형의 맞은편 꼭짓점 사이는 약하게 유지해 굽힘에 저항한다.
 const edgeTriangles=new Map<number,number[]>();
 for(let t=0;t<triangles.length;t+=3)for(let e=0;e<3;e++){const a=triangles[t+e],b=triangles[t+(e+1)%3],key=a<b?a*n+b:b*n+a,opposite=triangles[t+(e+2)%3];const list=edgeTriangles.get(key);if(list)list.push(opposite);else edgeTriangles.set(key,[opposite]);}
 const edges:number[]=[],bends:number[]=[];
 for(const [key,opposite] of edgeTriangles){const a=Math.floor(key/n),b=key%n;edges.push(a,b);if(opposite.length===2)bends.push(opposite[0],opposite[1]);}
 // 소매의 첫 고리(진동 둘레)를 가장 가까운 몸판 입자 두 개에 잇는다(바느질).
 const stitches:number[]=[];
 const bodyPart=parts.findIndex(mesh=>mesh.name==='top-body');
 if(bodyPart>=0){
  const bodyFrom=partStart[bodyPart],bodyTo=bodyPart+1<parts.length?partStart[bodyPart+1]:n;
  parts.forEach((mesh,p)=>{
   if(mesh.name!=='sleeve')return;
   const ringSize=(mesh.userData.ringSize as number|undefined)??41,seam=new Set<number>();for(let i=0;i<ringSize;i++)seam.add(vertexParticle[p][i]);
   for(const s of seam){
    let best=-1,second=-1,bestD=Infinity,secondD=Infinity;
    for(let q=bodyFrom;q<bodyTo;q++){const d=(x[q*3]-x[s*3])**2+(x[q*3+1]-x[s*3+1])**2+(x[q*3+2]-x[s*3+2])**2;if(d<bestD){second=best;secondD=bestD;best=q;bestD=d;}else if(d<secondD){second=q;secondD=d;}}
    if(best>=0)stitches.push(s,best);if(second>=0)stitches.push(s,second);
   }
  });
 }
 const restOf=(pairs:number[])=>Float64Array.from({length:pairs.length/2},(_,i)=>{const a=pairs[i*2]*3,b=pairs[i*2+1]*3;return Math.hypot(x[a]-x[b],x[a+1]-x[b+1],x[a+2]-x[b+2]);});
 // 제약 목록은 좌표 배열 위치(입자 번호 ×3)로 바꿔 둔다.
 const offsets=(pairs:number[])=>Int32Array.from(pairs,v=>v*3);
 const edgeList=offsets(edges),edgeRest=restOf(edges),bendList=offsets(bends),bendRest=restOf(bends),stitchList=offsets(stitches),stitchRest=restOf(stitches);
 // 3) 덧붙은 조각은 쉬는 모양에서 가장 가까운 천 삼각형의 무게중심 좌표와 법선 방향 거리로 묶는다.
 // 소매단 띠('cuff')는 소매에, 나머지(밑단·카라·줄무늬·주머니 등)는 몸판에만 붙인다. 소매와 몸판이 맞닿은 진동 근처에서 엉뚱한 조각에
 // 붙어 시뮬레이션 뒤 가시처럼 튀어나오지 않게 하기 위해서다.
 const partOf=new Int32Array(n);parts.forEach((_,p)=>{const end=p+1<parts.length?partStart[p+1]:n;for(let i=partStart[p];i<end;i++)partOf[i]=p;});
 const trianglesOf=(names:string[])=>{const out:number[]=[];for(let t=0;t<triangles.length;t+=3)if(names.includes(parts[partOf[triangles[t]]].name))out.push(t);return out;};
 const bindings=[...bindOthers(others.filter(mesh=>mesh.name==='cuff'),x,triangles,trianglesOf(['sleeve'])),...bindOthers(others.filter(mesh=>mesh.name!=='cuff'),x,triangles,trianglesOf(PANELS))];
 // 어깨 맞춤: 절차형 상의의 어깨선은 몸보다 완만해서, 그대로 내려앉으면 목·어깨 둘레가 눌려 종이처럼 구겨진다. 실제 옷은 패턴의
 // 어깨 기울기가 몸에 맞으므로, 처음 settle 동안 yokeFrom 위의 모서리는 눌린 만큼 쉬는 길이를 줄이고(최대 shrink까지) 굽힘 기준도
 // 지금 모양으로 옮긴다. 그 아래 몸판의 둘레(실측)는 바꾸지 않는다.
 const yokeFrom=typeof group.userData.yokeFrom==='number'?group.userData.yokeFrom as number:Infinity;
 const above=(list:Int32Array)=>{const out:number[]=[];for(let c=0;c<list.length/2;c++)if(x[list[c*2]+1]>yokeFrom&&x[list[c*2+1]+1]>yokeFrom)out.push(c);return Int32Array.from(out);};
 const yokeEdges=above(edgeList),yokeBends=above(bendList),edgeStart=Float64Array.from(edgeRest);
 // 4) 시뮬레이션
 const h=1/settings.steps,total=Math.round(settings.seconds*settings.steps),gravity=9.81,damp=Math.exp(-settings.damping*h),sample=new Float64Array(4);
 // 제약마다 두 입자가 고침을 나눠 받는 몫(역질량 비율)을 미리 구해 둔다. 둘 다 고정이면 0이다.
 const sharesOf=(list:Int32Array)=>{const out=new Float64Array(list.length);for(let c=0;c<list.length;c+=2){const wa=inverseMass[list[c]/3],wb=inverseMass[list[c+1]/3],sum=wa+wb;if(sum){out[c]=wa/sum;out[c+1]=wb/sum;}}return out;};
 const edgeShares=sharesOf(edgeList),bendShares=sharesOf(bendList),stitchShares=sharesOf(stitchList);
 const solve=(list:Int32Array,rest:Float64Array,shares:Float64Array,fraction:number)=>{
  for(let c=0,m=rest.length;c<m;c++){
   const a=list[c*2],b=list[c*2+1],dx=x[b]-x[a],dy=x[b+1]-x[a+1],dz=x[b+2]-x[a+2],length=Math.sqrt(dx*dx+dy*dy+dz*dz);
   if(length<1e-9)continue;
   const s=fraction*(length-rest[c])/length,sa=s*shares[c*2],sb=s*shares[c*2+1];
   x[a]+=dx*sa;x[a+1]+=dy*sa;x[a+2]+=dz*sa;x[b]-=dx*sb;x[b+1]-=dy*sb;x[b+2]-=dz*sb;
  }
 };
 // 몸과 충돌: 거리장이 두께보다 작으면 기울기 방향으로 밀어 내고, 이번 단계에 표면을 따라 미끄러진 만큼을 마찰로 줄인다.
 // 바닥(settings.floor)도 위쪽 법선을 가진 표면으로 같은 방식으로 처리한다.
 // 몸·바닥에서 멀리 떨어진 입자는 한 단계에 움직일 수 있는 거리(속도 상한의 3배, 600단계/초에서 7.5mm)로 닿을 수 없는 동안
 // (최대 6단계) 거리장을 다시 읽지 않는다. step<0은 처음 겹침을 풀 때로, 모든 입자를 본다.
 const wake=new Int32Array(n),stride=3*1.5/settings.steps;
 const collide=(friction:number,step:number)=>{
  for(let i=0;i<n*3;i+=3){
   const p=i/3;if(!inverseMass[p]||step<wake[p])continue;
   const floorDepth=settings.floor+settings.thickness-x[i+1];
   sampleSdf(sdf,x[i],x[i+1],x[i+2],sample);
   let depth=settings.thickness-sample[0],nx=0,ny=1,nz=0;
   if(depth<=0&&floorDepth<=0){wake[p]=step+1+Math.min(6,Math.floor(Math.min(-depth,-floorDepth)/stride));continue;}
   if(depth>0){const g=Math.sqrt(sample[1]*sample[1]+sample[2]*sample[2]+sample[3]*sample[3]);if(g<1e-6)depth=0;else{nx=sample[1]/g;ny=sample[2]/g;nz=sample[3]/g;}}
   if(floorDepth>depth){depth=floorDepth;nx=0;ny=1;nz=0;}
   if(depth<=0)continue;
   x[i]+=nx*depth;x[i+1]+=ny*depth;x[i+2]+=nz*depth;
   if(!friction)continue;
   const mx=x[i]-previous[i],my=x[i+1]-previous[i+1],mz=x[i+2]-previous[i+2],along=mx*nx+my*ny+mz*nz;
   const tx=mx-along*nx,ty=my-along*ny,tz=mz-along*nz,slide=Math.sqrt(tx*tx+ty*ty+tz*tz),limit=friction*depth;
   const keep=slide<=limit?1:limit/slide;x[i]-=tx*keep;x[i+1]-=ty*keep;x[i+2]-=tz*keep;
  }
 };
 // 처음 모양에서 몸 안에 들어간 점은 시간을 흘리기 전에 밖으로 빼 둔다(속도가 생기지 않게).
 for(let pass=0;pass<20;pass++){collide(0,-1);solve(edgeList,edgeRest,edgeShares,1);solve(stitchList,stitchRest,stitchShares,1);}
 collide(0,-1);wake.fill(0);
 // 한 단계 속도 상한(m/s). 몸에서 크게 밀려난 점이 튀어 나가 계산이 깨지지 않게 한다.
 const maxVelocity=1.5;
 // 지금 입자 위치를 옷 조각에 써 넣고 덧붙은 조각을 따라 옮긴다. normals가 거짓이면(중간 모양) 법선 계산은 건너뛴다.
 const writeBack=(normals:boolean)=>{
  parts.forEach((mesh,p)=>{const position=mesh.geometry.getAttribute('position') as THREE.BufferAttribute,map=vertexParticle[p];for(let i=0;i<position.count;i++){const id=map[i]*3;position.setXYZ(i,x[id],x[id+1],x[id+2]);}position.needsUpdate=true;if(normals)smoothNormals(mesh.geometry);});
  applyBindings(bindings,x,normals);
 };
 if(onProgress){writeBack(false);onProgress(0);}
 let maxSpeed=0;const settleSteps=Math.round(total*settings.settle);
 const lengthOf=(list:Int32Array,c:number)=>{const a=list[c*2],b=list[c*2+1];return Math.hypot(x[a]-x[b],x[a+1]-x[b+1],x[a+2]-x[b+2]);};
 for(let step=0;step<total;step++){
  if(step<settleSteps&&step%10===0){
   for(const c of yokeEdges){const length=lengthOf(edgeList,c);if(length<edgeRest[c])edgeRest[c]=Math.max(length,edgeStart[c]*settings.shrink);}
   for(const c of yokeBends)bendRest[c]=lengthOf(bendList,c);
  }
  for(let i=0;i<n*3;i+=3){
   if(!inverseMass[i/3]){previous[i]=x[i];previous[i+1]=x[i+1];previous[i+2]=x[i+2];continue;}
   velocity[i]*=damp;velocity[i+1]=velocity[i+1]*damp-gravity*h;velocity[i+2]*=damp;
   previous[i]=x[i];previous[i+1]=x[i+1];previous[i+2]=x[i+2];
   x[i]+=velocity[i]*h;x[i+1]+=velocity[i+1]*h;x[i+2]+=velocity[i+2]*h;
  }
  for(let k=0;k<settings.iterations;k++){solve(edgeList,edgeRest,edgeShares,1);solve(stitchList,stitchRest,stitchShares,1);}
  // 굽힘은 약한 제약이라 두 단계에 한 번, 두 배 비율로 푼다.
  if(step%2===0)solve(bendList,bendRest,bendShares,Math.min(1,settings.bend*2));
  collide(settings.friction,step);
  maxSpeed=0;
  for(let i=0;i<n*3;i+=3){
   let vx=(x[i]-previous[i])/h,vy=(x[i+1]-previous[i+1])/h,vz=(x[i+2]-previous[i+2])/h;
   const speed=Math.sqrt(vx*vx+vy*vy+vz*vz);
   if(speed>maxVelocity){const k=maxVelocity/speed;vx*=k;vy*=k;vz*=k;}
   velocity[i]=vx;velocity[i+1]=vy;velocity[i+2]=vz;if(speed>maxSpeed)maxSpeed=speed;
  }
  if(onProgress&&(step+1)%progressEvery===0&&step+1<total){writeBack(false);onProgress((step+1)/total);}
 }
 // 5) 결과를 조각에 되돌리고, 덧붙은 조각을 천을 따라 옮긴 뒤 법선을 다시 계산한다.
 writeBack(true);
 // 요약: 모서리가 (어깨 맞춤 뒤의) 쉬는 길이보다 늘어나거나 줄어든 비율, 끝에도 0.2m/s보다 빨리 움직이는 입자 수(멈추지 않은 정도).
 let strainMax=0,strainSum=0;for(let c=0;c<edgeRest.length;c++){const a=edgeList[c*2],b=edgeList[c*2+1],length=Math.hypot(x[a]-x[b],x[a+1]-x[b+1],x[a+2]-x[b+2]),strain=edgeRest[c]>0?Math.abs(length/edgeRest[c]-1):0;strainSum+=strain;if(strain>strainMax)strainMax=strain;}
 let moving=0;for(let i=0;i<n;i++)if(Math.hypot(velocity[i*3],velocity[i*3+1],velocity[i*3+2])>.2)moving++;
 return {ms:Date.now()-started,particles:n,constraints:edgeRest.length+bendRest.length+stitchRest.length,maxSpeed,strainMean:strainSum/Math.max(1,edgeRest.length),strainMax,moving};
}

// allowed: 붙일 수 있는 삼각형들의 triangles 안 시작 위치.
function bindOthers(meshes:THREE.Mesh[],x:Float64Array,triangles:number[],allowed:number[]):Binding[]{
 if(!meshes.length)return [];
 // 입자 → 그 입자를 쓰는 (허용된) 삼각형 목록, 2cm 격자로 가장 가까운 입자를 찾는다.
 const n=x.length/3,around:number[][]=Array.from({length:n},()=>[]);
 for(const t of allowed)for(let e=0;e<3;e++)around[triangles[t+e]].push(t);
 const cell=.02,grid=new Map<string,number[]>(),keyOf=(px:number,py:number,pz:number)=>`${Math.floor(px/cell)},${Math.floor(py/cell)},${Math.floor(pz/cell)}`;
 for(let i=0;i<n;i++){if(!around[i].length)continue;const key=keyOf(x[i*3],x[i*3+1],x[i*3+2]),list=grid.get(key);if(list)list.push(i);else grid.set(key,[i]);}
 const nearest=(px:number,py:number,pz:number)=>{
  let best=-1,bestD=Infinity;
  for(let r=1;r<=4&&best<0;r++){
   const cx=Math.floor(px/cell),cy=Math.floor(py/cell),cz=Math.floor(pz/cell);
   for(let i=cx-r;i<=cx+r;i++)for(let j=cy-r;j<=cy+r;j++)for(let k=cz-r;k<=cz+r;k++)for(const q of grid.get(`${i},${j},${k}`)??[]){const d=(x[q*3]-px)**2+(x[q*3+1]-py)**2+(x[q*3+2]-pz)**2;if(d<bestD){bestD=d;best=q;}}
  }
  return best;
 };
 const p=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),closest=new THREE.Vector3(),plane=new THREE.Triangle(),normal=new THREE.Vector3(),bary=new THREE.Vector3();
 return meshes.map(mesh=>{
  const position=mesh.geometry.getAttribute('position'),matrix=mesh.matrixWorld,count=position.count,triangle=new Int32Array(count).fill(-1),weights=new Float32Array(count*4);
  for(let i=0;i<count;i++){
   p.fromBufferAttribute(position,i).applyMatrix4(matrix);
   const q=nearest(p.x,p.y,p.z);if(q<0)continue;
   const candidates=new Set<number>();for(const t of around[q]){candidates.add(t);for(let e=0;e<3;e++)for(const s of around[triangles[t+e]])candidates.add(s);}
   let best=-1,bestD=Infinity;
   for(const t of candidates){a.fromArray(x,triangles[t]*3);b.fromArray(x,triangles[t+1]*3);c.fromArray(x,triangles[t+2]*3);plane.set(a,b,c);plane.closestPointToPoint(p,closest);const d=closest.distanceToSquared(p);if(d<bestD){bestD=d;best=t;}}
   if(best<0)continue;
   a.fromArray(x,triangles[best]*3);b.fromArray(x,triangles[best+1]*3);c.fromArray(x,triangles[best+2]*3);plane.set(a,b,c);plane.getNormal(normal);
   const offset=p.clone().sub(a).dot(normal),projected=p.clone().addScaledVector(normal,-offset);
   THREE.Triangle.getBarycoord(projected,a,b,c,bary);
   triangle[i]=best;weights[i*4]=bary.x;weights[i*4+1]=bary.y;weights[i*4+2]=bary.z;weights[i*4+3]=offset;
  }
  return {mesh,triangle,weights,triangles};
 });
}

function applyBindings(bindings:Binding[],x:Float64Array,normals=true){
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3(),plane=new THREE.Triangle(),p=new THREE.Vector3(),inverse=new THREE.Matrix4();
 for(const binding of bindings){
  const {mesh,triangle,weights,triangles}=binding,position=mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  inverse.copy(mesh.matrixWorld).invert();
  for(let i=0;i<position.count;i++){
   const t=triangle[i];if(t<0)continue;
   a.fromArray(x,triangles[t]*3);b.fromArray(x,triangles[t+1]*3);c.fromArray(x,triangles[t+2]*3);plane.set(a,b,c);plane.getNormal(normal);
   p.set(0,0,0).addScaledVector(a,weights[i*4]).addScaledVector(b,weights[i*4+1]).addScaledVector(c,weights[i*4+2]).addScaledVector(normal,weights[i*4+3]).applyMatrix4(inverse);
   position.setXYZ(i,p.x,p.y,p.z);
  }
  position.needsUpdate=true;if(normals)smoothNormals(mesh.geometry);
 }
}

// 법선을 다시 계산하고, 같은 위치에 겹친 정점(고리의 시작·끝)은 법선을 평균해 이음매 줄이 보이지 않게 한다.
export function smoothNormals(geometry:THREE.BufferGeometry){
 geometry.computeVertexNormals();
 const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal') as THREE.BufferAttribute,groups=new Map<string,number[]>();
 for(let i=0;i<position.count;i++){const key=`${Math.round(position.getX(i)*1e5)},${Math.round(position.getY(i)*1e5)},${Math.round(position.getZ(i)*1e5)}`;const list=groups.get(key);if(list)list.push(i);else groups.set(key,[i]);}
 for(const list of groups.values()){
  if(list.length<2)continue;
  let nx=0,ny=0,nz=0;for(const i of list){nx+=normal.getX(i);ny+=normal.getY(i);nz+=normal.getZ(i);}
  const length=Math.hypot(nx,ny,nz)||1;for(const i of list)normal.setXYZ(i,nx/length,ny/length,nz/length);
 }
 normal.needsUpdate=true;geometry.computeBoundingSphere();geometry.computeBoundingBox();
}
