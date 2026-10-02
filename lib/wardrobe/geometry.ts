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

// 몇 개의 조절점을 부드러운 곡선으로 이어 높이 간격이 고른 고리 목록을 만든다. denseFrom 위쪽(목선 등)은 여덟 개를 더 촘촘히 넣는다.
function profileRings(control:Ring[],count:number,denseFrom?:number):Ring[]{
 const sorted=[...control].sort((a,b)=>a.y-b.y);
 const fine=new THREE.CatmullRomCurve3(sorted.map(r=>new THREE.Vector3(r.y,r.rx,r.rz)),false,'centripetal').getPoints(600);
 const y0=sorted[0].y,y1=sorted[sorted.length-1].y,heights:number[]=[];
 for(let i=0;i<=count;i++)heights.push(y0+(y1-y0)*i/count);
 if(denseFrom!==undefined)for(let i=1;i<=8;i++)heights.push(denseFrom+(y1-denseFrom)*i/8);
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
export type GarmentOptions={frontTexture?:THREE.Texture;fitView?:boolean};
// group.userData.fitEase: 핏 보기 색의 근거가 된 대표 높이의 여유(cm). 상의는 가슴, 하의는 엉덩이, 모자는 머리둘레.
export function makeGarment(product:Product,size:SizeMeasurements,body:BodyProfile,thumbnail=false,options:GarmentOptions={}):THREE.Group {
 const group=new THREE.Group();group.name=product.id;
 const fit=options.fitView===true;
 const mat=fit?new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8,side:THREE.DoubleSide}):fabricMaterial(product.color);
 const trim=fit?new THREE.MeshStandardMaterial({color:NO_FIT_DATA,roughness:.9,side:THREE.DoubleSide}):trimMaterial(product.color);
 // 정점 색이 없는 부분(소매·어깨 캡·챙)은 핏 보기에서 회색 재질을 쓴다.
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
   const top=shoulderY+.045,bottom=top-length,neckStart=shoulderY+.014;
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
   const lowerBody:Ring[]=photo?photo.bodyWidths.map((ratio,i)=>{const t=i/(photo.bodyWidths.length-1),[wx,wz]=ellipseRadii(c*ratio);return {y:photoArmpit-(photoArmpit-bottom)*t,rx:wx,rz:wz*(1-.05*t)};})
     :[{y:bottom,rx:rx*1.02,rz:rz*.95},{y:bottom+.04,rx:rx*1.02,rz:rz*.95},{y:bottom+length*.38,rx:rx*.985,rz:rz*.945},{y:shoulderY-.12,rx,rz}];
   const profile=profileRings([
     ...lowerBody,{y:shoulderY-.06,rx:rx+(sw-rx)*.4,rz:rz*.92},{y:shoulderY,rx:sw,rz:rz*.84},
     {y:shoulderY+.014,rx:sw*.82,rz:rz*.76},{y:shoulderY+.03,rx:sw*.5,rz:rz*.6},{y:top,rx:.068,rz:.061},
   ],22,top-.03);
   // 마네킹 팔은 1.34m(175cm 기준)에서 몸통 단면에 붙는다. 그래서 몸통 단면과 여유는 팔이 붙기 전 마지막 측정 행(1.32m)까지만 쓰고,
   // 1.32~1.40m(겨드랑이 둘레)는 1.32m 몸통 단면을 6% 넓힌 값을 하한으로 쓴다(그 사이 몸통이 넓어지는 정도). 그 위는 어깨 높이
   // 몸통이 중립 마네킹보다 넓어진 비율만큼 어깨·소매를 벌린다(좁아질 때는 옷 실측 그대로 둔다).
   const armpitY=1.32*k,coverY=1.4*k,underArm=shape.torso(armpitY),shoulderSpread=Math.max(1,ratio(shape.torso(1.42*k),shape.neutralTorso(1.42*k),'rx'));
   // 팔 굵기는 따로 재지 않으므로 가슴 높이 몸통이 굵어진 비율로 소매를 굵게 한다.
   const armScale=Math.max(1,ratio(shape.torso(1.3*k),shape.neutralTorso(1.3*k),'rx'));
   const widen=(y:number)=>1+(shoulderSpread-1)*Math.min(1,Math.max(0,(y-armpitY)/.06));
   // 가슴 실측이 있을 때만 가슴 띠(1.22m~겨드랑이)의 여유를 칠한다. 그 아래 몸판은 가슴에서 곧게 내린 가정 모양이다.
   const chestMeasured=size.chestCirc!==undefined||size.chestFlat!==undefined;
   const rings:Ring[]=profile.map(r=>{
     const ring:Ring={...r,rx:overPelvisRx(r.y,r.rx)*widen(r.y),rz:overPelvisRz(r.y,r.rz),dy:scoop(r.y),z:torsoZ(r.y),n:teeN(r.y)};
     // 여유는 옷 원래 반지름(profile)과 몸통 둘레로 잰다. 밑단 띠 높이는 판단하지 않는다.
     const section=r.y<=armpitY?shape.torso(r.y):r.y<coverY&&underArm?{...underArm,rx:underArm.rx*1.06}:null,ease=chestMeasured&&r.y>=1.22*k&&r.y<=armpitY&&r.y>bottom+.015?ringEase(r.rx,r.rz,section):null;
     return {...coverSection(ring,section),color:paint(ease,'top',r.y)};
   });
   if(chestMeasured&&1.3*k>bottom&&1.3*k<=armpitY){const p=radiiAt(profile,1.3*k),ease=ringEase(p.rx,p.rz,shape.torso(1.3*k));if(ease!==null)fitEase.chest=Math.round(ease*10)/10;}
   group.add(ringMesh(rings,mat));
   // 밑단 띠와 카라(목 둘레 띠). 카라는 본체 목선과 같은 높이 보정을 그대로 따른다.
   const hem=bandRings(rings,bottom,bottom+.024,.0018,y=>({z:torsoZ(y),n:teeN(y)}));group.add(ringMesh(hem,trim));
   const textured=Boolean(options.frontTexture);
   if(!shirt)group.add(ringMesh(rings.filter(r=>r.y>=top-.031).map(r=>({...r,rx:r.rx+.0016,rz:r.rz+.0016})),trim));
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
   const len=(size.sleeve??23)/100;
   // 티셔츠 소매: 소매단 둘레 약 36cm, 겨드랑이 쪽 약 46cm. 앞뒤(rz)가 좌우(rx)보다 조금 깊다.
   const sleeveRings=profileRings([{y:-len,rx:.05,rz:.058},{y:-len*.62,rx:.058,rz:.067},{y:-len*.25,rx:.063,rz:.073},{y:0,rx:.067,rz:.079}],12).map(r=>({...r,rx:r.rx*armScale,rz:r.rz*armScale}));
   for(const side of [-1,1]){
     const sleeve=new THREE.Group();
     sleeve.add(ringMesh(sleeveRings,plain));
     sleeve.add(ringMesh(bandRings(sleeveRings,-len,-len+.02,.0016),trim));
     // 어깨 캡: 소매 윗부분의 열린 가장자리를 둥글게 덮는다.
     const cap=new THREE.Mesh(new THREE.SphereGeometry(1,40,20),plain);cap.scale.set(.069*armScale,.046,.081*armScale);cap.position.y=-.004;cap.castShadow=true;cap.receiveShadow=true;sleeve.add(cap);
     // 마네킹 위팔은 어깨에서 약 23° 벌어져 내려오다 팔꿈치 아래에서 더 벌어지므로, 소매는 위팔 각도(약 0.4rad)에 맞춘다.
     sleeve.rotation.z=side*.4;sleeve.position.set(side*sw*.9*shoulderSpread,shoulderY-.01,torsoZ(shoulderY));group.add(sleeve);
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
     const at=(y:number)=>{const r=radiiAt(rings,y);return {y,rx:r.rx+.0018,rz:r.rz+.0018,z:torsoZ(y),n:teeN(y)};};for(let y=bottom+.05;y<upper;y+=.04)group.add(ringMesh([at(y),at(y+.012)],stripeMat));
   }
 } else if(product.slot==='bottom'){
   const length=(size.length??105)/100,rise=(size.rise??30)/100;
   const hipFlat=size.hipsFlat??((size.waistFlat??40)+12),hipCirc=hipFlat*2/100;
   // 마네킹 골반은 앞뒤/좌우 비율이 약 0.65이므로 바지 단면도 그에 가깝게(0.68) 두어, 엉덩이가 넓은 바지가 위에 입은 상의를 뚫지 않게 한다.
   const [hipX,hipZ]=ellipseRadii(hipCirc,.68);
   const [waistX,waistZ]=ellipseRadii((size.waistFlat??40)*2/100,.68);
   const crotch=waistY-rise,hem=waistY-length;
   // 엉덩이 부분은 밑위(가랑이) 높이까지 내려와 앞뒤 중앙에서 다리와 이어지고, 양옆은 안쪽으로 모인다.
   const seatProfile=profileRings([{y:crotch-.012,rx:hipX*.66,rz:hipZ*.58},{y:crotch+.02,rx:hipX*.86,rz:hipZ*.8},{y:crotch+.07,rx:hipX*.97,rz:hipZ*.9},{y:waistY-.12,rx:hipX,rz:hipZ},{y:waistY-.04,rx:waistX,rz:waistZ},{y:waistY,rx:waistX,rz:waistZ}],14);
   // 엉덩이 실측이 있을 때만 엉덩이 띠(0.88~0.99m, 가랑이 위·허리 7cm 아래)를 칠한다. 허리는 바지 허리선과 몸 측정 위치가 같은지
   // 알 수 없어 핏 카드처럼 판단을 보류하고, 다리 굵기는 엉덩이에서 나눠 그린 가정 모양이라 칠하지 않는다.
   const hipsMeasured=size.hipsFlat!==undefined;
   const seat:Ring[]=seatProfile.map(r=>{const section=shape.torso(r.y),ease=hipsMeasured&&r.y>=.88*k&&r.y<=.99*k&&r.y>crotch+.02&&r.y<waistY-.07?ringEase(r.rx,r.rz,section):null;return {...coverSection({...r,rx:pelvisRx(r.y,r.rx),rz:pelvisRz(r.y,r.rz),z:torsoZ(r.y),n:2.3},section),color:paint(ease,'seat',r.y)};});
   if(hipsMeasured&&.95*k>crotch+.02&&.95*k<waistY-.07){const p=radiiAt(seatProfile,.95*k),ease=ringEase(p.rx,p.rz,shape.torso(.95*k));if(ease!==null)fitEase.hips=Math.round(ease*10)/10;}
   group.add(ringMesh(seat,mat));
   // 밑단 단면 실측이 없으면 와이드·카펜터 바지는 허벅지 단면을 따라 곧게 떨어지게(밑단 ≈ 허벅지의 95%), 그 밖에는 24cm로 그린다.
   const wideLeg=product.silhouette==='wide'||product.style==='carpenter';
   const hemFlat=size.hemFlat??(wideLeg?(size.thighFlat!==undefined?size.thighFlat*.95:hipFlat*.62):24);
   const [hemX,hemZ]=ellipseRadii(hemFlat*2/100,.75);
   // Visual thigh radii are derived from hip partition, never used by numerical fit calculations.
   const legProfile=profileRings([{y:hem,rx:hemX,rz:hemZ},{y:hem+.05,rx:hemX*1.005,rz:hemZ*1.005},{y:(hem+crotch)/2,rx:(hemX+hipX*.53)/2,rz:hipZ*.8},{y:crotch+.1,rx:hipX*.52,rz:hipZ*.94},{y:waistY-.13,rx:hipX*.48,rz:hipZ*.9}],16);
   const leg=legProfile.map(r=>({...r,rx:Math.max(r.rx,legMin(r.y).rx),rz:Math.max(r.rz,legMin(r.y).rz)}));
   // 마네킹 다리는 위쪽에서 아래로 갈수록 바깥으로 벌어지므로, 다리 고리의 중심을 높이별 다리 중심선에 맞춘다.
   for(const s of [-1,1]){
     // 엉덩이 높이에서는 두 다리가 엉덩이 폭 안에서 만나도록 중심을 모은다.
     // 제한은 가랑이 위쪽에서만 걸고, 아래로 갈수록 풀어서 벌어진 다리 중심선을 그대로 따른다.
     const onLeg=(y:number)=>{const c=legCenter(y);return {x:s*Math.min(c.x,Math.max(hipX*.5,.1*k)+Math.max(0,crotch+.05-y)*2),z:c.z};};
     // 다리 단면 표는 오른쪽(+x) 다리 기준이므로 왼쪽은 x를 뒤집는다. 다리는 가정 모양이라 덮기만 하고 색은 판단 보류(회색)다.
     const sideLeg:Ring[]=leg.map(r=>{const at=shape.leg(r.y),section=at&&{...at,x:s*at.x};return {...coverSection({...r,...onLeg(r.y)},section),color:paint(null)};});
     group.add(ringMesh(sideLeg,mat));
     // 밑단 접단과 스티치 선
     group.add(ringMesh(bandRings(sideLeg,hem,hem+.03,.0016,onLeg),trim));
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
   // 허리밴드, 벨트 고리 다섯 개, 앞 여밈선
   const band=radiiAt(seat,waistY-.02),bandX=Math.max(pelvisRx(waistY-.02,waistX),band.rx),bandZ=Math.max(pelvisRz(waistY-.02,waistZ),band.rz);
   group.add(ringMesh([{y:waistY-.04,rx:bandX*1.012,rz:bandZ*1.012,z:torsoZ(waistY-.04),n:2.3},{y:waistY+.001,rx:bandX*1.012,rz:bandZ*1.012,z:torsoZ(waistY),n:2.3}],trim));
   for(const angle of [Math.PI/2-.62,Math.PI/2+.62,.05,Math.PI-.05,Math.PI*1.5]){
     const loop=new THREE.Mesh(new THREE.BoxGeometry(.012,.052,.006),trim);
     const tx=-bandX*Math.sin(angle),tz=bandZ*Math.cos(angle);
     loop.position.set(bandX*1.014*Math.cos(angle),waistY-.022,torsoZ(waistY-.022)+bandZ*1.014*Math.sin(angle));loop.rotation.y=Math.atan2(-tz,tx);loop.castShadow=true;group.add(loop);
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
