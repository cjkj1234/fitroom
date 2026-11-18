import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMannequin,bodyPositions,morphedPositions} from './mannequin-mesh';
import {DEFAULT_BODY,makePreset} from './body';
import {buildHair,hairDepth,type HairGeometry,type HairStyle} from './hair';
import {HAT_BASE_DROP} from './geometry';

const glb=readFileSync(new URL('../../public/models/mannequin.glb',import.meta.url));
const mesh=parseMannequin(new Uint8Array(glb));
const STYLES:HairStyle[]=['short','bob'];
const BODIES=[DEFAULT_BODY,makePreset(158,'slim'),makePreset(190,'broad')];

// 머리 단면에서 중심 (cx,cz)로부터 방향 (dx,dz)로 가장 먼 표면까지의 거리(hair.ts와 같은 방식, 테스트에서 따로 구현).
function headRadius(positions:Float32Array,triangles:number[],y:number,cx:number,cz:number,dx:number,dz:number){
 let best=NaN;
 for(let t=0;t<triangles.length;t+=3){
  const pts:number[]=[];
  for(let e=0;e<3;e++){
   const a=triangles[t+e]*3,b=triangles[t+(e+1)%3]*3,ya=positions[a+1],yb=positions[b+1];
   if((ya-y)*(yb-y)>0||ya===yb)continue;
   const s=(y-ya)/(yb-ya);pts.push(positions[a]+(positions[b]-positions[a])*s-cx,positions[a+2]+(positions[b+2]-positions[a+2])*s-cz);
  }
  if(pts.length<4)continue;
  const [x1,z1,x2,z2]=pts,ex=x2-x1,ez=z2-z1,det=dx*ez-dz*ex;if(Math.abs(det)<1e-12)continue;
  const r=(x1*ez-z1*ex)/det,u=(x1*dz-z1*dx)/det;
  if(r>0&&u>=0&&u<=1&&!(r<=best))best=r;
 }
 return best;
}
function headTriangles(positions:Float32Array,top:number){
 const k=top/1.75,out:number[]=[];
 for(let t=0;t<mesh.indices.length;t+=3){
  let ok=true;for(let e=0;e<3;e++){const v=mesh.indices[t+e]*3;if(positions[v+1]<top-.25*k||Math.abs(positions[v])>.17*k){ok=false;break;}}
  if(ok)out.push(mesh.indices[t],mesh.indices[t+1],mesh.indices[t+2]);
 }
 return out;
}
const vertices=(hair:HairGeometry)=>Array.from({length:hair.positions.length/3},(_,i)=>({x:hair.positions[i*3],y:hair.positions[i*3+1],z:hair.positions[i*3+2],t:hair.uvs[i*2+1]}));

test('hair builds finite, indexed geometry for every style and body size',()=>{
 for(const body of BODIES)for(const style of STYLES){
  const hair=buildHair(bodyPositions(mesh,body),mesh.indices,style);
  assert.ok(hair,`${style} ${body.measurements.height}cm`);
  assert.ok(hair.positions.every(Number.isFinite));
  assert.ok(hair.uvs.every(v=>v>=0&&v<=1));
  const count=hair.positions.length/3;assert.ok(hair.indices.every(i=>i<count));
  assert.equal(hair.indices.length%3,0);
  assert.ok(Math.abs(hair.top-body.measurements.height/100)<1e-3);
 }
});

test('hair stays outside the head, including where it passes over the ears',()=>{
 for(const body of BODIES){
  const positions=bodyPositions(mesh,body),top=body.measurements.height/100,tris=headTriangles(positions,top);
  for(const style of STYLES){
   const hair=buildHair(positions,mesh.indices,style)!;let worst=Infinity,checked=0;
   // 끝 20%는 두께를 줄여 두피에 닿게 하는 구간이라 뺀다.
   for(const v of vertices(hair)){
    if(v.t>.8)continue;
    const dx=v.x-hair.center.x,dz=v.z-hair.center.z,r=Math.hypot(dx,dz);if(r<1e-4)continue;
    const head=headRadius(positions,tris,v.y,hair.center.x,hair.center.z,dx/r,dz/r);if(!Number.isFinite(head))continue;
    worst=Math.min(worst,r-head);checked++;
   }
   assert.ok(checked>1000,`${style}: checked ${checked}`);
   assert.ok(worst>.001,`${style} ${body.measurements.height}cm: hair is only ${(worst*1000).toFixed(1)}mm off the head surface (needs > 1mm)`);
  }
 }
});

test('the front hairline leaves the forehead and brows uncovered, and the bob falls lower than the short cut',()=>{
 // 눈 높이: GLB의 왼눈 메시(모프 없음) 중심을 몸과 같은 변환(발바닥 0, 키 175cm)으로 옮긴다.
 const jsonLength=glb.readUInt32LE(12),json=JSON.parse(glb.subarray(20,20+jsonLength).toString());
 const eyeMesh=json.meshes.findIndex((m:{name?:string})=>m.name==='Eye_L');assert.ok(eyeMesh>=0);
 const eyeAccessor=json.accessors[json.meshes[eyeMesh].primitives[0].attributes.POSITION];
 let minY=Infinity,maxY=-Infinity;for(let i=1;i<mesh.positions.length;i+=3){minY=Math.min(minY,mesh.positions[i]);maxY=Math.max(maxY,mesh.positions[i]);}
 const eyeY=((eyeAccessor.min[1]+eyeAccessor.max[1])/2-minY)*1.75/(maxY-minY);
 const positions=morphedPositions(mesh,{} as Parameters<typeof morphedPositions>[1],175);
 const lowest:Record<string,{front:number;back:number}>={};
 for(const style of STYLES){
  const hair=buildHair(positions,mesh.indices,style)!;let front=Infinity,back=Infinity;
  for(const v of vertices(hair)){
   const phi=Math.atan2(v.x-hair.center.x,v.z-hair.center.z)*180/Math.PI;
   if(Math.abs(phi)<15)front=Math.min(front,v.y);
   if(Math.abs(phi)>165)back=Math.min(back,v.y);
  }
  // 눈썹은 눈 위 약 2cm. 앞머리는 그보다 위에서 끝나야 이마가 보인다.
  assert.ok(front>eyeY+.04,`${style}: front hairline ${(front-eyeY)*100}cm above the eyes`);
  lowest[style]={front,back};
 }
 assert.ok(lowest.bob.back<lowest.short.back-.02);
});

test('under a hat, hair is only built below the hat band and the crown is left open',()=>{
 const positions=bodyPositions(mesh,DEFAULT_BODY),top=DEFAULT_BODY.measurements.height/100,hatBase=top-HAT_BASE_DROP;
 for(const style of STYLES){
  const bare=buildHair(positions,mesh.indices,style)!,capped=buildHair(positions,mesh.indices,style,{hatBase})!;
  assert.ok(capped,`${style}: some hair shows below the hat`);
  assert.ok(Math.max(...vertices(capped).map(v=>v.y))<hatBase+.012);
  assert.ok(Math.max(...vertices(bare).map(v=>v.y))>top);
  assert.ok(capped.indices.length<bare.indices.length);
 }
});

test('hair length tables are left-right symmetric',()=>{
 for(const style of STYLES)for(let deg=0;deg<=180;deg+=7.5){
  const phi=deg*Math.PI/180;assert.ok(Math.abs(hairDepth(style,phi)-hairDepth(style,-phi))<1e-9);
 }
});
