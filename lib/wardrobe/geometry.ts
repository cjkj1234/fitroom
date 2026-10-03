import * as THREE from 'three';
import { bodyShape, ellipsePerimeter, type BodySection } from './body-shape';
import type { BodyProfile, Product, SizeMeasurements } from './types';

// n은 단면의 모양이다. 2는 타원이고, 커질수록 네모에 가까워져 몸통의 어깨·골반 모서리를 덮는다.
// color는 핏 보기에서 그 고리에 칠할 색(여유 정도)이다.
type Ring={y:number;rx:number;rz:number;x?:number;z?:number;n?:number;dy?:(angle:number)=>number;color?:THREE.Color};
export function ringMesh(rings:Ring[],material:THREE.Material,segments=64):THREE.Mesh {
 const vertices:number[]=[],uv:number[]=[],indices:number[]=[],colors:number[]=[],colored=rings.some(r=>r.color);
 rings.forEach((r,j)=>{const power=2/(r.n??2),c=r.color??NO_FIT_DATA;for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,cos=Math.cos(a),sin=Math.sin(a);vertices.push((r.x??0)+r.rx*Math.sign(cos)*Math.pow(Math.abs(cos),power),r.y+(r.dy?r.dy(a):0),(r.z??0)+r.rz*Math.sign(sin)*Math.pow(Math.abs(sin),power));uv.push(i/segments,j/Math.max(1,rings.length-1));if(colored)colors.push(c.r,c.g,c.b);}});
 for(let j=0;j<rings.length-1;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));if(colored)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
 // 고리의 시작과 끝 정점은 위치가 같지만 법선이 달라 세로 줄이 보이므로 평균을 낸다.
 const normal=g.getAttribute('normal');
 for(let j=0;j<rings.length;j++){const first=j*(segments+1),last=first+segments;const nx=(normal.getX(first)+normal.getX(last))/2,ny=(normal.getY(first)+normal.getY(last))/2,nz=(normal.getZ(first)+normal.getZ(last))/2,length=Math.hypot(nx,ny,nz)||1;normal.setXYZ(first,nx/length,ny/length,nz/length);normal.setXYZ(last,nx/length,ny/length,nz/length);}
 normal.needsUpdate=true;
 const m=new THREE.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;return m;
}
// 점 고리 목록으로 만든 곡면. 고리마다 같은 개수의 점이 있고(마지막 점은 첫 점과 같은 위치), 소매처럼 고리의 중심·방향이 고리마다 다를 때 쓴다.
function loftMesh(rings:THREE.Vector3[][],material:THREE.Material):THREE.Mesh{
 const n=rings[0].length,vertices:number[]=[],uv:number[]=[],indices:number[]=[];
 rings.forEach((ring,j)=>ring.forEach((p,i)=>{vertices.push(p.x,p.y,p.z);uv.push(i/(n-1),j/Math.max(1,rings.length-1));}));
 for(let j=0;j<rings.length-1;j++)for(let i=0;i<n-1;i++){const a=j*n+i,b=a+n;indices.push(a,b,a+1,b,b+1,a+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
 const normal=g.getAttribute('normal');
 for(let j=0;j<rings.length;j++){const first=j*n,last=first+n-1;const nx=(normal.getX(first)+normal.getX(last))/2,ny=(normal.getY(first)+normal.getY(last))/2,nz=(normal.getZ(first)+normal.getZ(last))/2,length=Math.hypot(nx,ny,nz)||1;normal.setXYZ(first,nx/length,ny/length,nz/length);normal.setXYZ(last,nx/length,ny/length,nz/length);}
 normal.needsUpdate=true;
 const m=new THREE.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;m.userData.ringSize=n;return m;
}
function ellipseRadii(circ:number,ratio=.67){const rx=circ/(Math.PI*(3*(1+ratio)-Math.sqrt((3+ratio)*(1+3*ratio))));return [rx,rx*ratio];}

// public/models/mannequin.glb(175cm)를 높이별로 실측한 몸 중심선이다. 이 마네킹은 몸통이 원점보다 앞(+z)으로 치우쳐 있고
// 다리가 A자로 벌어져 있어서, 옷의 고리를 이 중심선에 맞춰야 몸이 옷을 뚫고 나오지 않는다. 키가 다르면 같은 비율로 늘려 쓴다.
const REFERENCE_HEIGHT=1.75;
const TORSO_Z:Array<[number,number]>=[[.8,.005],[.95,.021],[1,.039],[1.05,.057],[1.12,.071],[1.2,.055],[1.3,.044],[1.35,.036],[1.4,.03],[1.45,.018],[1.5,.05]];
// 다리 중심선과 최소 반폭·반깊이(±3cm 높이 띠로 잰 값). 좁은 엉덩이 바지에서도 다리 튜브가 실제 허벅지보다 가늘어지지 않게 한다.
const LEG_X:Array<[number,number]>=[[.1,.236],[.2,.222],[.3,.2],[.4,.187],[.5,.158],[.6,.142],[.7,.13],[.8,.109],[.9,.099],[1,.098]];
const LEG_Z:Array<[number,number]>=[[.1,.016],[.2,-.003],[.3,-.008],[.4,.007],[.5,.028],[.6,.036],[.7,.03],[.8,.021],[.9,.011],[1,.033]];
const LEG_RX_MIN:Array<[number,number]>=[[.1,.036],[.3,.056],[.5,.055],[.6,.064],[.7,.078],[.8,.094],[.9,.082]];
const LEG_RZ_MIN:Array<[number,number]>=[[.1,.057],[.2,.04],[.3,.059],[.5,.065],[.6,.074],[.7,.088],[.8,.098],[.9,.116]];
// 골반 높이별 마네킹 반폭·반깊이. 바지 허리가 몸보다 작게 그려져 골반이 삐져나오지 않게 하는 시각용 하한이며 핏 계산에는 쓰지 않는다.
const PELVIS_HALF_WIDTH:Array<[number,number]>=[[.7,.205],[.8,.2],[.85,.19],[.9,.182],[.95,.177],[1.05,.174],[1.12,.147]];
const PELVIS_HALF_DEPTH:Array<[number,number]>=[[.9,.113],[.95,.115],[1,.111],[1.05,.107],[1.12,.102]];
const HEAD_Z=.058;
const SHOULDER_HEIGHT_RATIO=.835;
function interpolate(table:Array<[number,number]>,y:number){
 if(y<=table[0][0])return table[0][1];
 for(let i=1;i<table.length;i++){const [y1,v1]=table[i],[y0,v0]=table[i-1];if(y<=y1)return v0+(v1-v0)*(y-y0)/(y1-y0);}
 return table[table.length-1][1];
}

// 몇 개의 조절점을 부드러운 곡선으로 이어 높이 간격이 고른 고리 목록을 만든다. denseFrom 위쪽(목선 등)은 dense개를 더 촘촘히 넣는다.
// spacing을 주면 높이 대신 옆선(높이·반폭)을 따라 잰 길이로 고르게 나눈다. 어깨 꼭대기처럼 거의 수평인 곳에서도 고리 사이가
// spacing보다 벌어지지 않아, 천 시뮬레이션에서 몸이 고리 사이로 뚫고 나오지 않는다.
function profileRings(control:Ring[],count:number,denseFrom?:number,dense=8,spacing?:number):Ring[]{
 const sorted=[...control].sort((a,b)=>a.y-b.y);
 const fine=new THREE.CatmullRomCurve3(sorted.map(r=>new THREE.Vector3(r.y,r.rx,r.rz)),false,'centripetal').getPoints(600);
 if(spacing){
  const along=[0];for(let i=1;i<fine.length;i++)along.push(along[i-1]+Math.hypot(fine[i].x-fine[i-1].x,fine[i].y-fine[i-1].y));
  const total=along[along.length-1],n=Math.max(2,Math.ceil(total/spacing));
  return Array.from({length:n+1},(_,i)=>{
   const s=total*i/n;let j=1;while(j<fine.length-1&&along[j]<s)j++;
   const a=fine[j-1],b=fine[j],t=Math.min(1,Math.max(0,(s-along[j-1])/((along[j]-along[j-1])||1)));
   return {y:a.x+(b.x-a.x)*t,rx:a.y+(b.y-a.y)*t,rz:a.z+(b.z-a.z)*t};
  });
 }
 const y0=sorted[0].y,y1=sorted[sorted.length-1].y,heights:number[]=[];
 for(let i=0;i<=count;i++)heights.push(y0+(y1-y0)*i/count);
 if(denseFrom!==undefined)for(let i=1;i<=dense;i++)heights.push(denseFrom+(y1-denseFrom)*i/dense);
 heights.sort((a,b)=>a-b);
 return heights.filter((y,i)=>i===0||y-heights[i-1]>1e-5).map(y=>{
  let j=1;while(j<fine.length-1&&fine[j].x<y)j++;
  const a=fine[j-1],b=fine[j],t=Math.min(1,Math.max(0,(y-a.x)/((b.x-a.x)||1)));
  return {y,rx:a.y+(b.y-a.y)*t,rz:a.z+(b.z-a.z)*t};
 });
}
// 높이 y에서 고리의 반지름·중심 z·단면 모양(n)을 보간해 돌려준다. 고리는 y가 커지는 순서여야 한다.
function radiiAt(rings:Ring[],y:number){
 const shape=(r:Ring)=>({rx:r.rx,rz:r.rz,z:r.z??0,n:r.n??2});
 if(y<=rings[0].y)return shape(rings[0]);
 for(let j=1;j<rings.length;j++){
  const a=rings[j-1],b=rings[j];
  if(y<=b.y){const t=(y-a.y)/((b.y-a.y)||1),from=shape(a),to=shape(b);return {rx:from.rx+(to.rx-from.rx)*t,rz:from.rz+(to.rz-from.rz)*t,z:from.z+(to.z-from.z)*t,n:from.n+(to.n-from.n)*t};}
 }
 return shape(rings[rings.length-1]);
}
// 몸통 표면(고리 단면) 위 좌표 (x,y)의 앞(+1)·뒤(-1) z. offset만큼 바깥으로 띄워 주머니·단추가 옷에 묻히지 않게 한다.
function surfaceZ(rings:Ring[],x:number,y:number,side:1|-1,offset=0){
 const r=radiiAt(rings,y),inside=Math.max(0,1-Math.pow(Math.min(.999,Math.abs(x)/r.rx),r.n));
 return r.z+side*(r.rz*Math.pow(inside,1/r.n)+offset);
}
// (u,v)∈[0,1]² 격자를 point로 3D에 옮긴 얇은 조각. 주머니·플래킷처럼 표면을 따라가는 덧댐에 쓴다.
function patch(point:(u:number,v:number)=>THREE.Vector3,nu:number,nv:number,material:THREE.Material,uv?:(u:number,v:number)=>[number,number]){
 const positions:number[]=[],indices:number[]=[],uvs:number[]=[];
 for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){const p=point(i/nu,j/nv);positions.push(p.x,p.y,p.z);if(uv)uvs.push(...uv(i/nu,j/nv));}
 for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){const a=i*(nv+1)+j,b=a+nv+1;indices.push(a,b,a+1,b,b+1,a+1);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));if(uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
// 꼭짓점 목록과 삼각형 색인으로 만든 얇은 조각(카라 같은 비정형 모양).
function flap(vertices:THREE.Vector3[],triangles:number[],material:THREE.Material){
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flatMap(v=>[v.x,v.y,v.z]),3));geometry.setIndex(triangles);geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
// 밑단·소매단·카라 같은 띠는 같은 곡선 위의 두 높이를 잡아 반지름을 아주 조금 키워 겹친다. center는 그 높이의 중심 위치.
function bandRings(rings:Ring[],y0:number,y1:number,pad=.0016,center?:(y:number)=>{x?:number;z?:number;n?:number}):Ring[]{
 return [y0,y1].map(y=>{const r=radiiAt(rings,y);return {y,rx:r.rx+pad,rz:r.rz+pad,...(center?center(y):{})};});
}

function fabricMaterial(color:string){
 const base=new THREE.Color(color);
 // 스치는 각도의 광택(sheen)은 옷 색을 거의 그대로 따르게 해서, 검은 옷의 챙 아래나 가장자리가 하얗게 뜨지 않게 한다.
 return new THREE.MeshPhysicalMaterial({color:base,roughness:.86,sheen:.35,sheenRoughness:.7,sheenColor:base.clone().lerp(new THREE.Color('#ffffff'),.12),side:THREE.DoubleSide});
}
// 트림(밑단·솔기·밴드)은 본체보다 살짝 어둡게, 너무 어두운 색은 오히려 살짝 밝게 해서 디테일이 보이게 한다.
function trimMaterial(color:string){
 const trim=new THREE.Color(color),hsl={h:0,s:0,l:0};trim.getHSL(hsl);trim.setHSL(hsl.h,hsl.s,hsl.l<.2?hsl.l+.035:hsl.l*.86);
 return new THREE.MeshStandardMaterial({color:trim,roughness:1,side:THREE.DoubleSide});
}

// 핏 보기: 옷 둘레 − 몸 둘레(cm)를 색으로 칠한다. 0 미만은 옷이 몸보다 작아 끼는 곳(빨강), 클수록 넉넉함(파랑).
// 상품 실측이 있는 높이(상의 가슴, 하의 엉덩이, 모자 머리둘레)만 칠한다. 밑단·다리 굵기처럼 3D 모양을 만들려고 가정한 치수,
// 바지 허리(착용 위치 불확실), 조절형 모자, 어깨·소매는 회색(판단 보류)이다. 숫자 핏 카드(estimateFit)와 같은 기준이다.
const FIT_STOPS:Array<[number,string]>=[[-6,'#b3261e'],[-2,'#e0533d'],[0,'#ef8f3a'],[3,'#f2c94c'],[6,'#7bbf62'],[12,'#3ea58a'],[20,'#3b7fd4'],[30,'#2c56ad']];
const NO_FIT_DATA=new THREE.Color('#c9c5be');
export const FIT_LEGEND:Array<{label:string;range:string;color:string}>=[
 {label:'작음(끼임)',range:'0cm 미만',color:'#e0533d'},{label:'딱 맞음',range:'0–3cm',color:'#f2c94c'},{label:'보통',range:'3–12cm',color:'#7bbf62'},{label:'넉넉함',range:'12cm 이상',color:'#3b7fd4'},{label:'판단 보류',range:'실측 없음·가정 모양',color:'#c9c5be'},
];
export function easeColor(easeCm:number){
 if(easeCm<=FIT_STOPS[0][0])return new THREE.Color(FIT_STOPS[0][1]);
 for(let i=1;i<FIT_STOPS.length;i++){const [e1,c1]=FIT_STOPS[i],[e0,c0]=FIT_STOPS[i-1];if(easeCm<=e1)return new THREE.Color(c0).lerp(new THREE.Color(c1),(easeCm-e0)/(e1-e0));}
 return new THREE.Color(FIT_STOPS[FIT_STOPS.length-1][1]);
}
// 고리의 원래 옷 반지름(rx·rz)과 같은 높이 몸 단면의 둘레 차이(cm).
function ringEase(rx:number,rz:number,section:BodySection|null){return section?(ellipsePerimeter(rx,rz)-section.perimeter)*100:null;}
// 옷이 몸보다 작은 고리는 몸 단면 바깥(gap만큼)으로 밀어낸다. 실제 옷이 늘어나 몸을 감싸는 모습이며, 핏 보기에서는 빨강으로 표시된다.
const FIT_GAP=.004;
function coverSection(ring:Ring,section:BodySection|null):Ring{
 if(!section)return ring;
 const dz=Math.abs(section.z-(ring.z??0)),dx=Math.abs(section.x-(ring.x??0));
 return {...ring,rx:Math.max(ring.rx,section.rx+dx+FIT_GAP),rz:Math.max(ring.rz,section.rz+dz+FIT_GAP)};
}

// 바지 한 벌의 천: 엉덩이 고리(가랑이 조금 위~허리)와 두 다리 관(밑단~가랑이)을 하나의 곡면으로 잇는다. 각 다리의 맨 위 고리는
// 바깥쪽 절반이 엉덩이 맨 아래 고리의 그쪽 절반이고, 안쪽 절반은 몸 가운데 면(x=0)에서 앞 중심→가랑이→뒤 중심으로 내려갔다
// 올라오는 U자 밑위 곡선이다. 두 다리가 이 곡선을 함께 써서, 실제 바지처럼 앞·뒤 중심 솔기와 안쪽 솔기가 가랑이에서 만난다.
// 다리 고리의 i번째 점은 뒤(0)→바깥(N/4)→앞(N/2)→안쪽(3N/4) 순서이고, 맨 아래 다리 고리와 맨 위 고리 사이는 blend개의 고리로 잇는다.
function pantsSurface(seat:Ring[],legs:Array<{side:number;rings:Ring[]}>,crotch:number,N:number,blend:number,material:THREE.Material,colored:boolean){
 const positions:number[]=[],colors:number[]=[],uvs:number[]=[],indices:number[]=[];
 const add=(x:number,y:number,z:number,c:THREE.Color,u:number,v:number)=>{positions.push(x,y,z);if(colored)colors.push(c.r,c.g,c.b);uvs.push(u,v);return positions.length/3-1;};
 const at=(i:number)=>new THREE.Vector3(positions[i*3],positions[i*3+1],positions[i*3+2]);
 const seatIds=seat.map((r,j)=>Array.from({length:N},(_,i)=>{const a=i/N*Math.PI*2,c=Math.cos(a),s=Math.sin(a),p=2/(r.n??2);return add((r.x??0)+r.rx*Math.sign(c)*Math.pow(Math.abs(c),p),r.y+(r.dy?r.dy(a):0),(r.z??0)+r.rz*Math.sign(s)*Math.pow(Math.abs(s),p),r.color??NO_FIT_DATA,i/N,.5+.5*j/Math.max(1,seat.length-1));}));
 const base=seatIds[0],front=at(base[N/4]),back=at(base[3*N/4]),top=seat[0].y,mid=(front.z+back.z)/2,half=(front.z-back.z)/2;
 const crotchIds=Array.from({length:N/2-1},(_,m)=>{const t=Math.PI*(m+1)/(N/2);return add(0,top-(top-crotch)*Math.sin(t),mid+half*Math.cos(t),NO_FIT_DATA,.5,.5);});
 const stitch=(lower:number[],upper:number[],flip:boolean)=>{for(let i=0;i<N;i++){const a=lower[i],a1=lower[(i+1)%N],b=upper[i],b1=upper[(i+1)%N];if(flip)indices.push(a,a1,b,b,a1,b1);else indices.push(a,b,a1,b,b1,a1);}};
 for(let j=0;j<seatIds.length-1;j++)stitch(seatIds[j],seatIds[j+1],false);
 for(const {side,rings} of legs){
  const ids=rings.map((r,j)=>Array.from({length:N},(_,i)=>{const t=-Math.PI/2+i/N*Math.PI*2;return add((r.x??0)+side*r.rx*Math.cos(t),r.y,(r.z??0)+r.rz*Math.sin(t),r.color??NO_FIT_DATA,i/N,.5*j/rings.length);}));
  const topRing=Array.from({length:N},(_,i)=>i<=N/2?base[(3*N/4+side*i+N)%N]:crotchIds[i-N/2-1]),last=ids[ids.length-1];
  for(let b=1;b<=blend;b++){const t=b/(blend+1);ids.push(Array.from({length:N},(_,i)=>{const p=at(last[i]).lerp(at(topRing[i]),t);return add(p.x,p.y,p.z,NO_FIT_DATA,i/N,.5);}));}
  ids.push(topRing);
  // 왼쪽 다리는 거울상이라 면 방향이 바깥을 향하도록 삼각형 순서를 뒤집는다.
  for(let j=0;j<ids.length-1;j++)stitch(ids[j],ids[j+1],side<0);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));if(colored)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
 const mesh=new THREE.Mesh(g,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='bottom-body';mesh.userData.ringSize=N;return mesh;
}

function brimMeshes(rx:number,rz:number,base:number,zOffset:number,material:THREE.Material,edge:THREE.Material){
 const columns=32,rows=6,half=.9,length=.074,positions:number[]=[],indices:number[]=[],edgePoints:THREE.Vector3[]=[];
 for(let i=0;i<=columns;i++){
  const angle=-half+2*half*i/columns,sin=Math.sin(angle),cos=Math.cos(angle);
  const innerX=rx*sin,innerZ=rz*cos,nx=sin/rx,nz=cos/rz,norm=Math.hypot(nx,nz)||1;
  const side=Math.pow(Math.abs(angle)/half,2),reach=length*(1-.3*side);
  for(let j=0;j<=rows;j++){
   const s=j/rows,x=innerX+nx/norm*reach*s,z=innerZ+nz/norm*reach*s,y=base+.006-.024*Math.pow(s,1.4)-.02*side*s;
   positions.push(x,y,z+zOffset);if(j===rows)edgePoints.push(new THREE.Vector3(x,y,z+zOffset));
  }
 }
 for(let i=0;i<columns;i++)for(let j=0;j<rows;j++){const a=i*(rows+1)+j,b=a+rows+1;indices.push(a,b,a+1,b,b+1,a+1);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const brim=new THREE.Mesh(geometry,material);brim.castShadow=true;brim.receiveShadow=true;
 const rim=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePoints),48,.0022,6,false),edge);rim.castShadow=true;
 return [brim,rim];
}

// options.frontTexture: 평면 촬영한 상의 사진에서 만든 앞면 텍스처. 있으면 상의 앞면에 사진 무늬를 입히고 절차형 앞면 세부(카라·단추·주머니)는 생략한다.
// options.fitView: 핏 보기. 옷 몸판을 여유(옷 둘레 − 몸 둘레) 색으로 칠하고, 소매·덧댐처럼 판단하지 않는 부분은 회색으로 둔다.
// fine: 천 시뮬레이션(cloth.ts)용으로 상의 몸판·소매 그물망을 약 1.2cm 간격으로 촘촘하게 만든다. 모양과 치수는 같다.
export type GarmentOptions={frontTexture?:THREE.Texture;fitView?:boolean;fine?:boolean};
// group.userData.fitEase: 핏 보기 색의 근거가 된 대표 높이의 여유(cm). 상의는 가슴, 하의는 엉덩이, 모자는 머리둘레.
export function makeGarment(product:Product,size:SizeMeasurements,body:BodyProfile,thumbnail=false,options:GarmentOptions={}):THREE.Group {
 const group=new THREE.Group();group.name=product.id;
 const fit=options.fitView===true;
 const mat=fit?new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8,side:THREE.DoubleSide}):fabricMaterial(product.color);
 const trim=fit?new THREE.MeshStandardMaterial({color:NO_FIT_DATA,roughness:.9,side:THREE.DoubleSide}):trimMaterial(product.color);
 // 정점 색이 없는 부분(소매·챙)은 핏 보기에서 회색 재질을 쓴다.
 const plain=fit?trim:mat;
 const fitRings:Array<{part:string;y:number;ease:number}>=[];group.userData.fitRings=fitRings;
 const paint=(ease:number|null,part='',y=0)=>{if(ease!==null&&part)fitRings.push({part,y:Math.round(y*1000)/1000,ease:Math.round(ease*10)/10});return fit?(ease===null?NO_FIT_DATA:easeColor(ease)):undefined;};
 const fitEase:Record<string,number>={};group.userData.fitEase=fitEase;
 const m=body.measurements,H=m.height/100,shoulderY=H*SHOULDER_HEIGHT_RATIO,waistY=m.legLength/100;
 // 몸 중심선은 마네킹 키(175cm) 기준 표를 현재 키에 맞게 늘려 쓴다. 옷 치수는 상품 실측 그대로이고, 체형 모프로
 // 몸 단면이 옷보다 커진 곳만 몸 바깥으로 밀어낸다(coverSection). 중심선과 골반·다리 하한도 모프로 변한 만큼 옮기고 늘린다.
 const k=H/REFERENCE_HEIGHT,shape=bodyShape(body);
 const shift=(now:BodySection|null,neutral:BodySection|null)=>now&&neutral?{x:now.x-neutral.x,z:now.z-neutral.z}:{x:0,z:0};
 const ratio=(now:BodySection|null,neutral:BodySection|null,key:'rx'|'rz')=>now&&neutral&&neutral[key]>0?now[key]/neutral[key]:1;
 const torsoZ=(y:number)=>interpolate(TORSO_Z,y/k)*k+shift(shape.torso(y),shape.neutralTorso(y)).z;
 const pelvisRx=(y:number,rx:number)=>Math.max(rx,interpolate(PELVIS_HALF_WIDTH,y/k)*k*1.06*ratio(shape.torso(y),shape.neutralTorso(y),'rx'));
 const pelvisRz=(y:number,rz:number)=>Math.max(rz,interpolate(PELVIS_HALF_DEPTH,y/k)*k*1.17*ratio(shape.torso(y),shape.neutralTorso(y),'rz'));
 const legMin=(y:number)=>{const now=shape.leg(y),neutral=shape.neutralLeg(y);return {rx:interpolate(LEG_RX_MIN,y/k)*k*1.15*ratio(now,neutral,'rx'),rz:interpolate(LEG_RZ_MIN,y/k)*k*1.15*ratio(now,neutral,'rz')};};
 const legCenter=(y:number)=>{const d=shift(shape.leg(y),shape.neutralLeg(y));return {x:interpolate(LEG_X,y/k)*k+d.x,z:interpolate(LEG_Z,y/k)*k+d.z};};
 if(product.slot==='top') {
   const c=(size.chestCirc??(size.chestFlat??53)*2)/100;
   // 판매자가 평면 사진에서 잰 몸판 실루엣(photoShape)이 있으면 기장 실측이 없을 때 사진 비율로 기장을 정한다.
   const photo=product.photoShape,[rx,rz]=ellipseRadii(c),length=size.length!==undefined?size.length/100:photo?c/2*photo.lengthToChest:.7,sw=(size.shoulder??50)/200;
   // 목 옆 점(HPS, 어깨선이 목선과 만나는 곳): 어깨에서 위로 올라가며 몸 단면 반폭이 목선 반폭(6.8cm)보다 6mm 이상 좁아지는 높이.
   // 상의 총장은 이 점에서 잰다.
   const NECK_RX=.068;let hps=shoulderY+.02;
   for(let y=1.44*k;y<1.56*k;y+=.002){const t=shape.torso(y);if(t&&t.rx<=NECK_RX-.006){hps=y;break;}}
   const top=hps,bottom=top-length,neckStart=top-.031;
   // 오픈카라 셔츠는 앞이 가슴까지 깊게 파인 V 목선(단추 여밈)이고, 티셔츠는 얕게 둥근 목선이다.
   const shirt=product.style==='shirt',neckDip=shirt?.11:.036,neckPower=shirt?3.2:1.6;
   // 앞쪽(+z)은 깊게 파이고 뒤쪽은 살짝 올라간 목선. 목에 가까운 고리일수록 더 많이 적용한다.
   const scoop=(y:number)=>{const t=Math.min(1,Math.max(0,(y-neckStart)/(top-neckStart))),k=t*t;return k?(a:number)=>{const s=Math.sin(a);return k*(s>0?-neckDip*Math.pow(s,neckPower):.006*Math.pow(-s,neckPower));}:undefined;};
   // 몸통(어깨뼈~골반)은 타원보다 네모에 가까우므로 어깨 아래는 n=2.6, 목선 쪽으로 갈수록 타원(n=2)으로 돌아온다.
   const teeN=(y:number)=>2+.6*Math.min(1,Math.max(0,(shoulderY+.02-y)/.12));
   // 상의는 바지 위에 덧입으므로, 골반 높이에서는 그 위의 바지가 삐져나오지 않을 만큼(폭 +20%, 깊이 +42%) 넉넉하게 감싼다.
   const overPelvisRx=(y:number,rx:number)=>y<1.12*k?Math.max(rx,interpolate(PELVIS_HALF_WIDTH,y/k)*k*1.2):rx;
   const overPelvisRz=(y:number,rz:number)=>y<1.12*k?Math.max(rz,interpolate(PELVIS_HALF_DEPTH,y/k)*k*1.5):rz;
   // 몸판 아래쪽 고리: 사진 실루엣이 있으면 겨드랑이(사진의 위치를 기장에 맞춰 옮김)부터 밑단까지 11곳의 폭 비율대로,
   // 없으면 가슴에서 곧게 내린 기본 모양으로 만든다. 평면 폭 W는 둘레 2W로 바꿔 타원 반지름을 구한다.
   const photoArmpit=photo?Math.min(shoulderY-.07,Math.max(shoulderY-.22,top-photo.armpit*length)):shoulderY-.12;
   // 천 시뮬레이션에서 몸에 맞춰 쉬는 길이를 조정해도 되는 어깨 부분의 아래 경계(겨드랑이 높이).
   group.userData.yokeFrom=Math.min(photoArmpit,shoulderY-.1);
   const lowerBody:Ring[]=photo?photo.bodyWidths.map((ratio,i)=>{const t=i/(photo.bodyWidths.length-1),[wx,wz]=ellipseRadii(c*ratio);return {y:photoArmpit-(photoArmpit-bottom)*t,rx:wx,rz:wz*(1-.05*t)};})
     :[{y:bottom,rx:rx*1.02,rz:rz*.95},{y:bottom+.04,rx:rx*1.02,rz:rz*.95},{y:bottom+length*.38,rx:rx*.985,rz:rz*.945},{y:shoulderY-.12,rx,rz}];
   // 마네킹 팔은 1.34m(175cm 기준)에서 몸통 단면에 붙는다. 그래서 몸통 단면과 여유는 팔이 붙기 전 마지막 측정 행(1.32m)까지만 쓰고,
   // 1.32~1.40m(겨드랑이 둘레)는 1.32m 몸통 단면을 6% 넓힌 값을 하한으로 쓴다(그 사이 몸통이 넓어지는 정도). 그 사이는
   // 몸통이 중립 마네킹보다 넓어진 비율만큼 벌린다(좁아질 때는 옷 실측 그대로 둔다).
   const armpitY=1.32*k,coverY=1.4*k,underArm=shape.torso(armpitY),shoulderSpread=Math.max(1,ratio(shape.torso(1.42*k),shape.neutralTorso(1.42*k),'rx'));
   // 어깨(요크): 1.40m(175cm 기준)부터 목 옆까지는 그 높이 몸 단면(어깨·삼각근 포함)에서 8mm 띄워 감싼다. 실제 옷은 패턴의 어깨
   // 기울기가 몸에 맞아 어깨 위에 얹히므로, 어깨 위에 떠 있는 선반 같은 모양을 만들지 않는다. 옷 어깨 너비(sw)는 아래 진동 위치로 쓴다.
   const YOKE_EASE=.008,yoke:Ring[]=[];
   // 단면 표는 2cm 간격이라 둥근 어깨 꼭대기에서는 사이 높이의 폭을 작게 어림한다. 그래서 정지 화면에서는 그 높이와 2cm 아래 단면을
   // 함께 덮는다. 천 시뮬레이션용(fine)은 그 높이 단면만 감싼다. 넓게 잡으면 어깨에서 미끄러져 옷 전체가 내려앉고, 실제 몸과의
   // 충돌은 시뮬레이션이 정확한 거리장으로 처리하기 때문이다.
   for(let y=coverY;y<top-.012;y+=.01){
    const t=shape.torso(y),below=options.fine?t:shape.torso(y-.02*k);if(!t||!below)continue;
    yoke.push({y,rx:Math.max(t.rx,below.rx)+YOKE_EASE,rz:Math.max(t.rz+Math.abs(t.z-torsoZ(y)),below.rz+Math.abs(below.z-torsoZ(y)))+YOKE_EASE});
   }
   const neck=shape.torso(top),neckRz=Math.max(.061,neck?neck.rz+Math.abs(neck.z-torsoZ(top))+.004:0);
   // 몸판(밑단~겨드랑이)과 어깨(겨드랑이~목)는 따로 곡선을 잇는다. 한 곡선으로 이으면 어깨로 급히 넓어지는 쪽에 끌려 가슴 아래가 오목하게 처진다.
   // 어깨(1.40m 위)는 5mm 간격으로 촘촘히 둔다(어깨 꼭대기 곡면과 목선 파임). fine은 옆선을 따라 1.2cm 간격으로 나눈다.
   const armpitRing=lowerBody.reduce((a,b)=>b.y>a.y?b:a);
   const lowerProfile=profileRings(lowerBody,options.fine?Math.ceil((armpitRing.y-bottom)/.012):18);
   const upperProfile=profileRings([armpitRing,...yoke,{y:top,rx:NECK_RX,rz:neckRz}],4,coverY,Math.ceil((top-coverY)/.005),options.fine?.012:undefined);
   const profile=[...lowerProfile,...upperProfile.slice(1)];
   // 소매 기본 굵기는 가슴 높이 몸통이 굵어진 비율로 키운다. 그래도 팔 단면보다 가는 곳은 아래 소매 만들기에서 팔 바깥으로 밀어 낸다.
   const armScale=Math.max(1,ratio(shape.torso(1.3*k),shape.neutralTorso(1.3*k),'rx'));
   // 어깨 단면은 넓고 납작한 둥근 사각형이라, 반폭·반깊이에 맞춘 타원은 등·가슴 쪽 모서리를 덮지 못한다. 그래서 겨드랑이 위에서는
   // 단면을 네모에 가깝게(n=4) 키우고, 목선 1.5~4.5cm 아래에서 다시 둥글게(n=2) 돌린다.
   const yokeN=(y:number)=>{if(y<armpitY)return teeN(y);const up=Math.min(1,(y-armpitY)/(coverY-armpitY)),neck=Math.min(1,Math.max(0,(top-.015-y)/.03));return teeN(y)+(4-teeN(y))*up*neck;};
   const widen=(y:number)=>y>=coverY?1:1+(shoulderSpread-1)*Math.min(1,Math.max(0,(y-armpitY)/.06));
   // 가슴 실측이 있을 때만 가슴 띠(1.22m~겨드랑이)의 여유를 칠한다. 그 아래 몸판은 가슴에서 곧게 내린 가정 모양이다.
   const chestMeasured=size.chestCirc!==undefined||size.chestFlat!==undefined;
   const rings:Ring[]=profile.map(r=>{
     const ring:Ring={...r,rx:overPelvisRx(r.y,r.rx)*widen(r.y),rz:overPelvisRz(r.y,r.rz),dy:scoop(r.y),z:torsoZ(r.y),n:yokeN(r.y)};
     // 여유는 옷 원래 반지름(profile)과 몸통 둘레로 잰다. 밑단 띠 높이는 판단하지 않는다.
     const section=r.y<=armpitY||r.y>=coverY?shape.torso(r.y):underArm?{...underArm,rx:underArm.rx*1.06}:null,ease=chestMeasured&&r.y>=1.22*k&&r.y<=armpitY&&r.y>bottom+.015?ringEase(r.rx,r.rz,section):null;
     return {...coverSection(ring,section),color:paint(ease,'top',r.y)};
   });
   if(chestMeasured&&1.3*k>bottom&&1.3*k<=armpitY){const p=radiiAt(profile,1.3*k),ease=ringEase(p.rx,p.rz,shape.torso(1.3*k));if(ease!==null)fitEase.chest=Math.round(ease*10)/10;}
   // 촘촘한 그물망에서는 밑단·카라·줄무늬 띠도 몸판과 같은 분할(112)로 만들어, 시뮬레이션 뒤 몸판을 따라 옮겼을 때 몸판에 묻히지 않게 한다.
   const segments=options.fine?112:64,panel=ringMesh(rings,mat,segments);panel.name='top-body';group.add(panel);
   // 밑단 띠와 카라(목 둘레 띠). 카라는 본체 목선과 같은 높이 보정을 그대로 따른다.
   const hem=bandRings(rings,bottom,bottom+.024,.0018,y=>({z:torsoZ(y),n:teeN(y)}));group.add(ringMesh(hem,trim,segments));
   const textured=Boolean(options.frontTexture);
   if(!shirt)group.add(ringMesh(rings.filter(r=>r.y>=top-.031).map(r=>({...r,rx:r.rx+.0016,rz:r.rz+.0016})),trim,segments));
   else{
     // 오픈카라: 앞 V 가장자리를 따라 넓게 젖혀진 카라 두 장. 바깥 끝으로 갈수록 살짝 들뜬다. 사진 텍스처를 입히면 사진 속 카라를 쓴다.
     const lift=(x:number,y:number,offset:number)=>new THREE.Vector3(x,y,surfaceZ(rings,x,y,1,offset));
     if(!textured)for(const s of [-1,1]){
       const corners=[[.006,top-.105,.004],[.052,top+.002,.006],[.114,top-.02,.011],[.09,top-.114,.015]].map(([x,y,o])=>lift(s*x,y,o));
       group.add(flap(corners,s>0?[0,1,3,1,2,3]:[0,3,1,1,3,2],trim));
     }
     // 뒷목 카라 받침: 뒤쪽 반원만 목 둘레 띠로 둘러 카라가 목 뒤에서 이어지게 한다.
     group.add(patch((u,v)=>{const a=Math.PI+u*Math.PI,r=radiiAt(rings,top-.014+v*.016);return new THREE.Vector3(Math.cos(a)*(r.rx+.002),top-.014+v*.016,r.z+Math.sin(a)*(r.rz+.002));},16,1,trim));
   }
   const sleeveLength=(size.sleeve??23)/100;
   // 소매: 몸판 겉면 위의 진동 둘레(어깨점~옷의 겨드랑이)에서 시작해, 이 체형의 팔 중심선(몸 단면 표의 팔 단면 중심, 팔꿈치에서 꺾인다)을
   // 따라 소매단까지 이어지는 곡면. 진동 둘레를 몸판 표면에 붙여 그려 어깨 위로 솟는 덩어리(이전의 공 모양 어깨 캡)가 없고,
   // 사진 실루엣의 겨드랑이가 깊은 옷은 진동도 깊어진다. 진동 둘레의 앞뒤는 그 높이 진동 띠(어깨 끝·겨드랑이 앞뒤 몸 표면)를 1cm 넉넉히 덮는다.
   // 소매 길이는 어깨점에서 소매 윗선을 따라 소매단까지의 거리(판매자 소매 실측)다.
   if(sleeveLength>=.03){
     // 진동 위끝(어깨점): 몸판 반폭이 옷 어깨 반폭(sw)에 닿는 높이. 겨드랑이보다 9cm 이상 위, 목 옆보다 2cm 아래로 제한한다.
     // 어깨가 몸보다 넓은 옷(드롭 숄더)은 그 높이에서 남는 어깨 폭만큼 소매를 늘인다(소매 실측은 옷의 어깨점에서 잰다).
     const armholeBottom=photoArmpit;let armholeTop=top-.02;
     while(armholeTop>armholeBottom+.09&&radiiAt(rings,armholeTop).rx<sw)armholeTop-=.002;
     const len=sleeveLength+Math.max(0,sw-radiiAt(rings,armholeTop).rx),seamY=(armholeTop+armholeBottom)/2,seamHalf=(armholeTop-armholeBottom)/2;
     const SEG=40,ARMHOLE_GAP=.01,SLEEVE_GAP=.01,BLEND=.09;
     // 진동 둘레는 세로로 긴 둥근 사각형에 가깝게(앞뒤 깊이에 |sin|^0.6) 그려, 겨드랑이 바로 위 앞뒤 접힘(가슴·등 쪽)까지 덮는다.
     // 오른쪽(+x) 기준으로 만들고 왼쪽은 x를 뒤집는다.
     const seam=Array.from({length:SEG+1},(_,i)=>{
      const a=i/SEG*Math.PI*2,y=seamY+seamHalf*Math.cos(a),s=Math.sin(a),r=radiiAt(rings,y),band=shape.armhole(y);
      const reach=band?(s>0?band.z+band.rz+ARMHOLE_GAP:band.z-band.rz-ARMHOLE_GAP)-r.z:Math.sign(s)*Math.min(r.rz*.8,seamHalf*1.05);
      const dz=Math.max(-r.rz*.97,Math.min(r.rz*.97,reach*Math.pow(Math.abs(s),.6))),t=Math.abs(dz)/r.rz;
      return new THREE.Vector3(r.rx*Math.pow(1-Math.pow(t,r.n),1/r.n)+.002,y,r.z+dz);
     });
     // 팔 중심선: 팔이 몸통에서 떨어지는 1.32m(175cm 기준)부터 2cm마다의 팔 단면 중심. 1.10m 아래는 손이라 쓰지 않고 마지막 방향으로 늘인다.
     // 위쪽은 위팔 방향(1.32~1.26m)으로 진동 가운데 높이까지 늘여 어깨 관절 쪽 시작점으로 삼는다.
     const line:THREE.Vector3[]=[];
     for(let i=0;i<=11;i++){const y=(1.32-i*.02)*k,a=shape.arm(y);if(!a)break;line.push(new THREE.Vector3(a.x,y,a.z));}
     if(line.length<4)line.splice(0,line.length,new THREE.Vector3(.255*k,1.32*k,.013*k),new THREE.Vector3(.269*k,1.3*k,.015*k),new THREE.Vector3(.282*k,1.28*k,.017*k),new THREE.Vector3(.296*k,1.26*k,.018*k));
     const smooth=line.map((p,i)=>i===0||i===line.length-1?p:p.clone().add(line[i-1]).add(line[i+1]).multiplyScalar(1/3));
     const upward=smooth[0].clone().sub(smooth[3]).normalize(),last=smooth[smooth.length-1],down=last.clone().sub(smooth[smooth.length-3]).normalize();
     const axis=[smooth[0].clone().addScaledVector(upward,(seamY-smooth[0].y)/upward.y),...smooth,last.clone().addScaledVector(down,.6)];
     const lengths=axis.map((_,i)=>i?axis[i].distanceTo(axis[i-1]):0).map((_,i,d)=>d.slice(0,i+1).reduce((x,y)=>x+y,0));
     const pointAt=(u:number)=>{let i=1;while(i<axis.length-1&&lengths[i]<u)i++;const t=(u-lengths[i-1])/(lengths[i]-lengths[i-1]);return axis[i-1].clone().lerp(axis[i],Math.max(0,Math.min(1,t)));};
     // 소매 기본 굵기(옷 쪽 여유): 진동 쪽 반지름 6.7·7.9cm에서 20cm 지점 5·5.8cm, 긴소매는 손목 쪽 3.8·4.2cm까지 좁아진다.
     const base=(u:number):[number,number]=>{const a=Math.min(1,u/.2),b=Math.max(0,Math.min(1,(u-.2)/.3));return [(.067-.017*a-.012*b)*armScale,(.079-.021*a-.016*b)*armScale];};
     const smoothstep=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
     const ringAt=(u:number)=>{
      const center=pointAt(u),tangent=pointAt(u+.02).sub(pointAt(Math.max(0,u-.02))).normalize();
      const up=new THREE.Vector3(0,1,0).addScaledVector(tangent,-tangent.y).normalize(),across=new THREE.Vector3().crossVectors(tangent,up).normalize();if(across.z<0)across.negate();
      const [ru,rv]=base(u),w=smoothstep(u/BLEND);
      const points=seam.map((p,i)=>{
       const a=i/SEG*Math.PI*2,q=center.clone().addScaledVector(up,ru*Math.cos(a)).addScaledVector(across,rv*Math.sin(a)),v=p.clone().lerp(q,w);
       // 팔 단면(그 높이의 수평 타원) 안으로 들어간 점은 단면 중심에서 바깥으로 밀어 팔이 소매를 뚫지 않게 한다.
       const arm=v.y<=1.33*k?shape.arm(v.y):null;
       if(arm){const dx=v.x-arm.x,dz=v.z-arm.z,e=Math.hypot(dx/(arm.rx+SLEEVE_GAP),dz/(arm.rz+SLEEVE_GAP));if(e<1&&e>1e-6){v.x=arm.x+dx/e;v.z=arm.z+dz/e;}}
       return v;
      });
      return {points,center};
     };
     // 소매단 위치: 어깨점에서 소매 윗선(고리의 맨 위 점들)을 따라 잰 길이가 소매 길이가 되는 곳.
     let end=0,travelled=0,previous=seam[0];
     for(let u=.005;u<1.2;u+=.005){const top=ringAt(u).points[0];travelled+=top.distanceTo(previous);previous=top;end=u;if(travelled>=len)break;}
     const steps=Math.max(10,Math.ceil(end/(options.fine?.012:.02))),sleeveRings=Array.from({length:steps+1},(_,j)=>j?ringAt(end*j/steps).points:seam);
     const cuff=ringAt(end),hemStart=ringAt(Math.max(0,end-.02));
     const outward=(ring:{points:THREE.Vector3[];center:THREE.Vector3})=>ring.points.map(p=>p.clone().addScaledVector(p.clone().sub(ring.center).normalize(),.0016));
     for(const side of [-1,1]){
       // 왼쪽은 x를 뒤집고, 면 방향이 바깥을 향하도록 고리 점 순서도 뒤집는다.
       const place=(ring:THREE.Vector3[])=>{const out=ring.map(p=>new THREE.Vector3(side*p.x,p.y,p.z));return side>0?out.reverse():out;};
       const sleeve=loftMesh(sleeveRings.map(place),plain);sleeve.name='sleeve';group.add(sleeve);
       // 소매단 접단: 소매단에서 어깨 쪽으로 2cm, 바깥으로 1.6mm 띄운 띠.
       const cuffBand=loftMesh([place(outward(cuff)),place(outward(hemStart))],trim);cuffBand.name='cuff';group.add(cuffBand);
     }
   }
   if(options.frontTexture&&!fit){
     // 평면 사진 앞면: 가슴 폭(가장 넓은 몸통 반폭)을 기준으로 사진을 가로로 펴고, 좁아지는 목·어깨 쪽은 옆을 잘라 낸다(늘리지 않는다).
     const texture=options.frontTexture,frontMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:.9,side:THREE.DoubleSide});
     const yTop=top-.004,yBottom=bottom+.006,halfWidth=Math.max(...rings.filter(r=>r.y>bottom+.05&&r.y<shoulderY-.05).map(r=>r.rx))*.99;
     const front=patch((u,v)=>{const y=yTop+(yBottom-yTop)*v,r=radiiAt(rings,y),x=Math.max(-r.rx*.99,Math.min(r.rx*.99,(u-.5)*2*halfWidth));return new THREE.Vector3(x,y,surfaceZ(rings,x,y,1,.0018));},24,32,frontMaterial,(u,v)=>[u,1-v]);
     front.name='front-texture';group.add(front);
   }
   if(shirt&&!textured){
     // 앞 단추 여밈선(플래킷)과 단추, 착용자 왼쪽(+x) 가슴 주머니.
     const placketTop=top-.105,placketBottom=bottom+.02,buttonMat=fit?trim:new THREE.MeshStandardMaterial({color:'#e9e4d6',roughness:.45});
     group.add(patch((u,v)=>{const x=(u-.5)*.042,y=placketTop+(placketBottom-placketTop)*v;return new THREE.Vector3(x,y,surfaceZ(rings,x,y,1,.0025));},1,14,trim));
     const buttons=6,firstY=placketTop-.05,lastY=bottom+.1;
     for(let i=0;i<buttons;i++){const y=firstY+(lastY-firstY)*i/(buttons-1),button=new THREE.Mesh(new THREE.SphereGeometry(1,14,8),buttonMat);button.scale.set(.0068,.0068,.0035);button.position.set(0,y,surfaceZ(rings,0,y,1,.0055));button.castShadow=true;group.add(button);}
     const pocketTop=top-.19,pocketBottom=top-.305;
     group.add(patch((u,v)=>{const x=.06+u*.115,y=pocketTop+(pocketBottom-pocketTop)*v;return new THREE.Vector3(x,y,surfaceZ(rings,x,y,1,.003));},6,6,trim));
   }
   if(product.silhouette==='stripe'&&!fit){
     const stripeMat=new THREE.MeshStandardMaterial({color:'#37404d',roughness:.9,side:THREE.DoubleSide});
     const upper=shoulderY-.14;
     const at=(y:number)=>{const r=radiiAt(rings,y);return {y,rx:r.rx+.0018,rz:r.rz+.0018,z:torsoZ(y),n:teeN(y)};};for(let y=bottom+.05;y<upper;y+=.04)group.add(ringMesh([at(y),at(y+.012)],stripeMat,segments));
   }
 } else if(product.slot==='bottom'){
   // 판매자가 평면 바지 사진에서 잰 실루엣(legShape)이 있으면, 실측이 빈 기장·밑위·엉덩이는 사진 비율로 채우고 다리 폭 변화를 사진대로 만든다.
   const legShape=product.legShape,waistFlat=size.waistFlat??40;
   const length=(size.length??(legShape?waistFlat*legShape.lengthToWaist:105))/100,rise=(size.rise??(legShape?legShape.rise*length*100:30))/100;
   const hipFlat=size.hipsFlat??(legShape?waistFlat*legShape.hipToWaist:waistFlat+12),hipCirc=hipFlat*2/100;
   // 마네킹 골반은 앞뒤/좌우 비율이 약 0.65이므로 바지 단면도 그에 가깝게(0.68) 두어, 엉덩이가 넓은 바지가 위에 입은 상의를 뚫지 않게 한다.
   const [hipX,hipZ]=ellipseRadii(hipCirc,.68);
   const [waistX,waistZ]=ellipseRadii(waistFlat*2/100,.68);
   // 밑위 실측은 허리에서 가랑이까지 앞 솔기를 따라 잰 길이라 수직 높이보다 길다. 수직으로는 그 82%로 보고(가정), 몸 가랑이(몸통 단면이
   // 두 다리로 갈라지는 높이)보다 1.5cm 이상 아래에 둔다.
   let bodyCrotch=.83*k;for(let y=k;y>.6*k;y-=.005)if(!shape.torso(y)){bodyCrotch=y;break;}
   const crotch=Math.min(waistY-rise*.82,bodyCrotch-.015),hem=waistY-length;
   // 엉덩이 고리는 가랑이 조금 위(밑위 높이의 30%, 최대 7cm)부터 허리까지, 그 아래는 두 다리다.
   const seatBottom=crotch+Math.min(.07,(waistY-crotch)*.3),legTop=crotch-.005;
   const fine=options.fine===true,N=fine?80:64,step=fine?.015:.03;
   // 허리선은 앞이 1.2cm 낮고 뒤가 1.2cm 높다(바지 허리는 뒤가 더 올라온다). 허리 6cm 아래부터 서서히 기운다.
   const tiltAt=(y:number)=>Math.min(1,Math.max(0,(y-(waistY-.06))/.06)),tilt=(y:number)=>{const t=tiltAt(y);return t?(a:number)=>-.012*t*Math.sin(a):undefined;};
   const seatProfile=profileRings([{y:seatBottom,rx:hipX*.96,rz:hipZ*.9},...(waistY-.12>seatBottom+.02?[{y:waistY-.12,rx:hipX,rz:hipZ}]:[]),{y:waistY-.04,rx:waistX,rz:waistZ},{y:waistY,rx:waistX,rz:waistZ}],Math.max(3,Math.ceil((waistY-seatBottom)/step)));
   // 엉덩이 실측이 있을 때만 엉덩이 띠(0.88~0.99m, 가랑이 위·허리 7cm 아래)를 칠한다. 허리는 바지 허리선과 몸 측정 위치가 같은지
   // 알 수 없어 핏 카드처럼 판단을 보류하고, 다리 굵기는 엉덩이에서 나눠 그린 가정 모양이라 칠하지 않는다.
   const hipsMeasured=size.hipsFlat!==undefined;
   const seat:Ring[]=seatProfile.map(r=>{const section=shape.torso(r.y),ease=hipsMeasured&&r.y>=.88*k&&r.y<=.99*k&&r.y>crotch+.02&&r.y<waistY-.07?ringEase(r.rx,r.rz,section):null;return {...coverSection({...r,rx:pelvisRx(r.y,r.rx),rz:pelvisRz(r.y,r.rz),z:torsoZ(r.y),n:2.3},section),dy:tilt(r.y),color:paint(ease,'seat',r.y)};});
   if(hipsMeasured&&.95*k>crotch+.02&&.95*k<waistY-.07){const p=radiiAt(seatProfile,.95*k),ease=ringEase(p.rx,p.rz,shape.torso(.95*k));if(ease!==null)fitEase.hips=Math.round(ease*10)/10;}
   // 밑단 단면 실측이 없으면 와이드·카펜터 바지는 허벅지 단면을 따라 곧게 떨어지게(밑단 ≈ 허벅지의 95%), 그 밖에는 24cm로 그린다.
   const wideLeg=product.silhouette==='wide'||product.style==='carpenter';
   const hemFlat=size.hemFlat??(wideLeg?(size.thighFlat!==undefined?size.thighFlat*.95:hipFlat*.62):24);
   const [hemX,hemZ]=ellipseRadii(hemFlat*2/100,.75);
   // Visual thigh radii are derived from hip partition, never used by numerical fit calculations.
   // 사진 실루엣의 다리 폭은 허벅지 대비 비율이라 허벅지단면 실측(없으면 엉덩이단면의 62%로 어림)으로 크기를 정한다. 다리 단면은 앞뒤가 조금 깊은 타원(1.05)이다.
   const thighFlat=size.thighFlat??hipFlat*.62;
   const legControl:Ring[]=legShape?legShape.legWidths.map((ratio,i)=>{const [rx,rz]=ellipseRadii(thighFlat*ratio*2/100,1.05);return {y:legTop-(legTop-hem)*i/(legShape.legWidths.length-1),rx,rz};})
     :[{y:hem,rx:hemX,rz:hemZ},{y:hem+.05,rx:hemX*1.005,rz:hemZ*1.005},{y:(hem+legTop)/2,rx:(hemX+hipX*.53)/2,rz:hipZ*.8},{y:legTop,rx:hipX*.53,rz:hipZ*.92}];
   const legProfile=profileRings(legControl,Math.max(8,Math.ceil((legTop-hem)/step)));
   const leg=legProfile.map(r=>({...r,rx:Math.max(r.rx,legMin(r.y).rx),rz:Math.max(r.rz,legMin(r.y).rz)}));
   // 마네킹 다리는 위쪽에서 아래로 갈수록 바깥으로 벌어지므로, 다리 고리의 중심을 높이별 다리 중심선에 맞춘다.
   const legs=[-1,1].map(s=>{
     // 엉덩이 높이에서는 두 다리가 엉덩이 폭 안에서 만나도록 중심을 모은다.
     // 제한은 가랑이 위쪽에서만 걸고, 아래로 갈수록 풀어서 벌어진 다리 중심선을 그대로 따른다.
     const onLeg=(y:number)=>{const c=legCenter(y);return {x:s*Math.min(c.x,Math.max(hipX*.5,.1*k)+Math.max(0,crotch+.05-y)*2),z:c.z};};
     // 다리 단면 표는 오른쪽(+x) 다리 기준이므로 왼쪽은 x를 뒤집는다. 다리는 가정 모양이라 덮기만 하고 색은 판단 보류(회색)다.
     // 두 다리 관이 가랑이 근처에서 겹치지 않게, 안쪽 끝은 몸 가운데에서 4mm 이상 떨어지도록 중심을 바깥으로 옮긴다.
     const rings:Ring[]=leg.map(r=>{const at=shape.leg(r.y),section=at&&{...at,x:s*at.x},ring=coverSection({...r,...onLeg(r.y)},section);return {...ring,x:s*Math.max(Math.abs(ring.x??0),ring.rx+.004),color:paint(null)};});
     return {side:s,rings,onLeg};
   });
   // 바지 천(엉덩이와 두 다리를 하나로 이은 곡면). 천 시뮬레이션에서는 허리밴드 높이(위 3.5cm)의 고리를 허리에 고정한다.
   const pants=pantsSurface(seat,legs,crotch,N,fine?4:2,mat,fit),pinRings=Math.ceil(.035/step)+1;
   pants.userData.pinned=[(seat.length-pinRings)*N,seat.length*N];group.add(pants);
   for(const {side:s,rings:sideLeg,onLeg} of legs){
     // 밑단 접단과 스티치 선
     group.add(ringMesh(bandRings(sideLeg,hem,hem+.03,.0016,onLeg),trim,N));
     if(product.style==='carpenter'){
       // 옆 카고 주머니와 라벨: 바깥쪽 옆선(a=0)에서 뒤쪽으로 치우친 곳에 다리 단면을 따라 붙인다.
       const y0=hem+.06,y1=Math.min(y0+.21,crotch-.02);
       if(y1-y0>.08){
         const onLegSurface=(a:number,y:number,offset:number)=>{const c=onLeg(y),r=radiiAt(sideLeg,y);return new THREE.Vector3(c.x+s*(r.rx+offset)*Math.cos(a),y,c.z+(r.rz+offset)*Math.sin(a));};
         group.add(patch((u,v)=>onLegSurface(-1+u*1.3,y1+(y0-y1)*v,.004),8,6,trim));
         const label=fit?trim:new THREE.MeshStandardMaterial({color:'#d6d0c0',roughness:.8,side:THREE.DoubleSide});
         group.add(patch((u,v)=>onLegSurface(-.66+u*.3,y0+.03+(.05)*v,.0075),3,2,label));
       }
     }
   }
   if(product.style==='carpenter'){
     // 뒷면 패치 주머니 두 개
     for(const s of [-1,1])group.add(patch((u,v)=>{const x=s*(.03+u*.115),y=waistY-.085+(-.13)*v;return new THREE.Vector3(x,y,surfaceZ(seat,x,y,-1,.004));},6,6,trim));
   }
   // 허리밴드, 벨트 고리 다섯 개, 앞 여밈선. 허리밴드와 고리도 허리선 기울기를 따른다.
   const band=radiiAt(seat,waistY-.02),bandX=Math.max(pelvisRx(waistY-.02,waistX),band.rx),bandZ=Math.max(pelvisRz(waistY-.02,waistZ),band.rz);
   const waistband=ringMesh([{y:waistY-.04,rx:bandX*1.012,rz:bandZ*1.012,z:torsoZ(waistY-.04),n:2.3,dy:tilt(waistY-.04)},{y:waistY+.001,rx:bandX*1.012,rz:bandZ*1.012,z:torsoZ(waistY),n:2.3,dy:tilt(waistY)}],trim,N);waistband.name='bottom-waistband';group.add(waistband);
   for(const angle of [Math.PI/2-.62,Math.PI/2+.62,.05,Math.PI-.05,Math.PI*1.5]){
     const loop=new THREE.Mesh(new THREE.BoxGeometry(.012,.052,.006),trim);
     const tx=-bandX*Math.sin(angle),tz=bandZ*Math.cos(angle),y=waistY-.022-.012*tiltAt(waistY-.022)*Math.sin(angle);
     loop.position.set(bandX*1.014*Math.cos(angle),y,torsoZ(y)+bandZ*1.014*Math.sin(angle));loop.rotation.y=Math.atan2(-tz,tx);loop.castShadow=true;group.add(loop);
   }
   const flyY=waistY-.04-.055,fly=new THREE.Mesh(new THREE.BoxGeometry(.004,.11,.004),trim);fly.position.set(0,flyY,torsoZ(flyY)+radiiAt(seat,flyY).rz+.001);group.add(fly);
 } else {
   const circ=(size.headCirc??57)/100;// 마네킹 머리는 가로보다 앞뒤가 깊고(반폭 7.8cm, 반깊이 10cm) 중심이 앞으로 치우쳐 있어 모자도 같은 비율·위치로 만든다.
   const head=shape.torso(1.66*k),base=H-.105,crownH=.118,hz=HEAD_Z*k+shift(head,shape.neutralTorso(1.66*k)).z;
   const [headX,headZ]=ellipseRadii(circ,1.28);
   // 모자 아래쪽 띠가 닿는 높이의 머리 단면보다 모자가 작으면 머리에 맞게 키운다(끼는 모자). 조절형은 판단을 보류한다.
   const band=[base,base+.02,base+.04].map(y=>shape.torso(y)).filter((section):section is BodySection=>section!==null);
   const needX=Math.max(0,...band.map(section=>section.rx+FIT_GAP)),needZ=Math.max(0,...band.map(section=>section.rz+Math.abs(section.z-hz)+FIT_GAP));
   const grow=Math.max(1,needX/(headX*1.035),needZ/(headZ*1.035)),rx=headX*1.035*grow,rz=headZ*1.035*grow;
   const headEase=product.adjustableHat||size.headCirc===undefined?null:ringEase(headX,headZ,head);if(headEase!==null)fitEase.head=Math.round(headEase*10)/10;
   const crown=(phi:number)=>Math.max(.004,Math.pow(Math.cos(phi),.82));
   const dome:Ring[]=Array.from({length:18},(_,k)=>{const phi=k/17*Math.PI/2,r=crown(phi);return {y:base+Math.sin(phi)*crownH,rx:rx*r*1.004,rz:rz*r*1.004,z:hz,color:paint(headEase,k===0?'head':'',base)};});
   group.add(ringMesh(dome,mat));
   // 6패널 솔기, 정수리 단추, 테두리 띠
   for(let k=0;k<6;k++){
     const theta=Math.PI/2+k*Math.PI/3,points:THREE.Vector3[]=[];
     for(let n=0;n<=14;n++){const phi=.03+(Math.PI/2-.09)*n/14,r=crown(phi);points.push(new THREE.Vector3(Math.cos(theta)*rx*r*1.007,base+Math.sin(phi)*crownH*1.002,hz+Math.sin(theta)*rz*r*1.007));}
     const seam=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),28,.0012,4,false),trim);seam.castShadow=true;group.add(seam);
   }
   const button=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),trim);button.scale.setScalar(.009);button.position.set(0,base+crownH+.002,hz);group.add(button);
   group.add(ringMesh([{y:base-.002,rx:rx*1.008,rz:rz*1.008,z:hz},{y:base+.016,rx:rx*1.008,rz:rz*1.008,z:hz}],trim));
   for(const part of brimMeshes(rx,rz,base,hz,plain,trim))group.add(part);
 }
 if(thumbnail){const box=new THREE.Box3().setFromObject(group),center=box.getCenter(new THREE.Vector3());group.position.sub(center);}
 return group;
}
export function disposeGroup(group:THREE.Object3D){const mats=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach((m:THREE.Material)=>mats.add(m));}});mats.forEach(m=>m.dispose());}
