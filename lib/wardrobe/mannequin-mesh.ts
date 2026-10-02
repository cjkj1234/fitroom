// public/models/mannequin.glb를 Node에서 읽어 체형 모프를 적용하고, 수평으로 잘라 단면(몸통·다리·팔)을 재는 도구.
// 브라우저 번들에는 들어가지 않는다(측정 스크립트와 테스트에서만 쓴다).
import {MORPH_TARGETS,morphWeights,type MorphWeights} from './body-shape';
import type {BodyProfile} from './types';

export type MannequinMesh={positions:Float32Array;targets:Record<string,Float32Array>;indices:Uint32Array;names:string[]};
export type Point={x:number;y:number;z:number};
export type Section={perimeter:number;minX:number;maxX:number;minZ:number;maxZ:number;crossesCenter:boolean};

export function parseMannequin(buffer:Uint8Array):MannequinMesh{
 const view=new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength);
 const jsonLength=view.getUint32(12,true);
 const json=JSON.parse(new TextDecoder().decode(buffer.subarray(20,20+jsonLength)));
 const binStart=20+jsonLength+8;
 const mesh=json.meshes[0],primitive=mesh.primitives[0],names:string[]=mesh.extras?.targetNames??[];
 const floats=(index:number)=>{
  const accessor=json.accessors[index],bufferView=json.bufferViews[accessor.bufferView],stride=bufferView.byteStride||12;
  const start=binStart+(bufferView.byteOffset||0)+(accessor.byteOffset||0),out=new Float32Array(accessor.count*3);
  for(let i=0;i<accessor.count;i++)for(let c=0;c<3;c++)out[i*3+c]=view.getFloat32(start+i*stride+c*4,true);
  return out;
 };
 const indexAccessor=json.accessors[primitive.indices],indexView=json.bufferViews[indexAccessor.bufferView];
 const indexStart=binStart+(indexView.byteOffset||0)+(indexAccessor.byteOffset||0),indices=new Uint32Array(indexAccessor.count);
 const size=indexAccessor.componentType===5125?4:2;
 for(let i=0;i<indexAccessor.count;i++)indices[i]=size===4?view.getUint32(indexStart+i*4,true):view.getUint16(indexStart+i*2,true);
 const targets:Record<string,Float32Array>={};
 (primitive.targets??[]).forEach((target:{POSITION:number},i:number)=>{targets[names[i]]=floats(target.POSITION);});
 return {positions:floats(primitive.attributes.POSITION),targets,indices,names};
}

// avatar-view.tsx의 update()와 같은 순서로 모프를 적용한다: 모프 → 가로·깊이는 키 비율로 확대 → 세로는 발바닥 0, 정수리 = 키가 되게 맞춤.
export function morphedPositions(mesh:MannequinMesh,weights:MorphWeights,heightCm:number):Float32Array{
 const scale=heightCm/175,out=new Float32Array(mesh.positions);
 for(const name of MORPH_TARGETS){const w=weights[name],delta=mesh.targets[name];if(!w||!delta)continue;for(let i=0;i<out.length;i++)out[i]+=w*delta[i];}
 let minY=Infinity,maxY=-Infinity;for(let i=1;i<out.length;i+=3){minY=Math.min(minY,out[i]);maxY=Math.max(maxY,out[i]);}
 const scaleY=heightCm/100/(maxY-minY);
 for(let i=0;i<out.length;i+=3){out[i]*=scale;out[i+1]=(out[i+1]-minY)*scaleY;out[i+2]*=scale;}
 return out;
}
export function bodyPositions(mesh:MannequinMesh,body:BodyProfile){return morphedPositions(mesh,morphWeights(body),body.measurements.height);}

// 높이 y의 수평 단면. 삼각형을 잘라 생긴 선분을 메시 모서리 공유로 이어 고리(몸통·다리·팔)별로 묶는다.
export function sliceAt(positions:Float32Array,indices:Uint32Array,y:number):Section[]{
 const parent=new Map<string,string>(),point=new Map<string,[number,number]>(),segments:Array<[string,string]>=[];
 const find=(k:string):string=>{let r=k;while(parent.get(r)!==r)r=parent.get(r)!;let c=k;while(parent.get(c)!==r){const n=parent.get(c)!;parent.set(c,r);c=n;}return r;};
 const cut=(a:number,b:number):string|null=>{
  const ya=positions[a*3+1],yb=positions[b*3+1];
  if((ya-y)*(yb-y)>0||ya===yb)return null;
  const key=a<b?`${a}_${b}`:`${b}_${a}`;
  if(!point.has(key)){const t=(y-ya)/(yb-ya);point.set(key,[positions[a*3]+(positions[b*3]-positions[a*3])*t,positions[a*3+2]+(positions[b*3+2]-positions[a*3+2])*t]);parent.set(key,key);}
  return key;
 };
 for(let i=0;i<indices.length;i+=3){
  const v=[indices[i],indices[i+1],indices[i+2]],keys=[cut(v[0],v[1]),cut(v[1],v[2]),cut(v[2],v[0])].filter((k):k is string=>k!==null);
  if(keys.length>=2){segments.push([keys[0],keys[1]]);const ra=find(keys[0]),rb=find(keys[1]);if(ra!==rb)parent.set(ra,rb);}
 }
 const groups=new Map<string,Array<[number,number]>>();
 for(const key of point.keys()){const root=find(key);if(!groups.has(root))groups.set(root,[]);groups.get(root)!.push(point.get(key)!);}
 return [...groups.values()].filter(points=>points.length>=6).map(points=>{
  const hull=convexHull(points);let perimeter=0;
  for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length];perimeter+=Math.hypot(a[0]-b[0],a[1]-b[1]);}
  const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs);
  return {perimeter,minX,maxX,minZ:Math.min(...zs),maxZ:Math.max(...zs),crossesCenter:minX<0&&maxX>0};
 });
}
// 줄자는 오목한 곳을 건너 재므로 둘레는 볼록 껍질의 둘레로 잰다.
function convexHull(points:Array<[number,number]>){
 const sorted=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(o:number[],a:number[],b:number[])=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 const lower:Array<[number,number]>=[],upper:Array<[number,number]>=[];
 for(const p of sorted){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
 for(const p of [...sorted].reverse()){while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
 return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
// 몸통(중앙을 지나는 고리)과 오른쪽(+x) 다리를 고른다. 다리는 중앙을 지나지 않는 고리 중 중앙에 가장 가까운 것(손·팔은 더 바깥에 있다).
export function torsoAndLeg(sections:Section[]){
 const torso=sections.filter(s=>s.crossesCenter).sort((a,b)=>b.perimeter-a.perimeter)[0]??null;
 const leg=torso?null:sections.filter(s=>s.minX>0).sort((a,b)=>a.minX-b.minX)[0]??null;
 return {torso,leg};
}
