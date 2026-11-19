// 평면 촬영한 상품 사진(앞·뒤)을 3D 옷에 입히는 배치. 사진의 옷 마스크에서 줄마다 몸판(소매 제외)·엉덩이·두 다리의 왼쪽·오른쪽 끝과
// 소매 네 모서리(어깨점·겨드랑이·소매단 위·아래)를 재고, 3D 옷 위 점(높이 비율과 몸 둘레 방향)을 사진 위 픽셀로 옮긴다.
// 사진은 옷을 바닥에 펴 놓고 위에서 찍은 것으로 보고, 3D 옷의 앞 절반을 펴면 앞 사진, 뒤 절반을 펴면 뒤 사진이 된다고 둔다.
// 좌표: 사진 x는 오른쪽, y는 아래로 증가. 3D는 +x가 착용자 왼쪽, +z가 앞이다. 앞 사진에서는 착용자 왼쪽(+x)이 사진 오른쪽,
// 뒤 사진(등을 위로 놓고 찍음)에서는 착용자 왼쪽이 사진 왼쪽이다. DOM 없이 픽셀 배열만 다뤄 Node 테스트에서도 쓴다.
import {locateBottom,locateTop} from '../seller/photo-silhouette';
import type {GarmentCutout} from '../seller/photo-texture';

export type Pt=[number,number];
export type Span=[number,number];
export type View='front'|'back';
// 소매 네 모서리: 어깨점(shoulder)과 겨드랑이(armpit)를 잇는 선이 진동 둘레, 소매단 위(cuffTop)·아래(cuffBottom)를 잇는 선이 소매단이다.
export type SleeveQuad={shoulder:Pt;armpit:Pt;cuffTop:Pt;cuffBottom:Pt};
export const TOP_ROWS=64,SEAT_ROWS=24,LEG_ROWS=48;
// top·bottom: 옷의 위끝·아래끝 줄. torso: 위끝~아래끝을 같은 간격으로 나눈 TOP_ROWS줄의 몸판 [왼쪽 x, 오른쪽 x].
// sleeves: [사진 왼쪽 소매, 사진 오른쪽 소매]. 소매를 찾지 못한 쪽은 null(민소매·접힌 소매).
// neck(앞 사진만): 앞 목선. 목둘레 안으로 보이는 뒤판 안쪽을 빼고 앞판이 시작되는 깊이(depth, 위끝에서 px)와 목 둘레 반폭(half), 가운데 x(cx).
export type FrontNeck={cx:number;depth:number;half:number};
export type TopLayout={kind:'top';width:number;height:number;top:number;bottom:number;armpit:number;torso:Span[];sleeves:[SleeveQuad|null,SleeveQuad|null];neck?:FrontNeck};
// seat: 허리(top)~가랑이(crotch) SEAT_ROWS줄의 바지 폭. legs: 가랑이~밑단(bottom) LEG_ROWS줄의 [사진 왼쪽 다리, 오른쪽 다리].
export type BottomLayout={kind:'bottom';width:number;height:number;top:number;bottom:number;crotch:number;seat:Span[];legs:Array<[Span,Span]>};
export type PhotoLayout=TopLayout|BottomLayout;

const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const median=(values:number[])=>{if(!values.length)return NaN;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];};
const TAU=Math.PI*2;
const wrap=(phi:number)=>((phi%TAU)+TAU)%TAU;

// 흑백 마스크(1=옷)에서 옷 상자를 구해 cutOutGarment와 같은 모양으로 만든다. 저장된 마스크 이미지를 다시 읽을 때 쓴다.
export function cutoutFromMask(mask:Uint8Array,width:number,height:number):GarmentCutout|null{
 let x0=width,y0=height,x1=-1,y1=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
 return x1<0?null:{width,height,mask,box:{x0,y0,x1,y1}};
}

// 줄 표(rows, 위끝~아래끝 같은 간격)에서 비율 t(0~1)의 값을 선형 보간한다.
function rowAt<T extends number[]>(rows:T[],t:number):T{
 const f=clamp(t,0,1)*(rows.length-1),i=Math.min(rows.length-2,Math.floor(f)),s=f-i,a=rows[i],b=rows[i+1];
 return a.map((v,k)=>lerp(v,b[k],s)) as T;
}

// 상의 배치. shoulderToChest: 옷 어깨너비 ÷ 가슴단면(판매자 실측). 사진에서는 소매가 붙는 어깨점이 보이지 않아 이 비율로 정한다.
export function analyzeTopLayout(cutout:GarmentCutout,shoulderToChest=.92):{layout:TopLayout|null;reason:string}{
 const located=locateTop(cutout);if(!located.frame)return {layout:null,reason:located.reason};
 const {cx,armpit,chest,central}=located.frame,{box,mask,width,height}=cutout;
 const clampY=(y:number)=>clamp(Math.round(y),box.y0,box.y1);
 // 겨드랑이 아래 몸판: 가운데 덩어리의 양 끝(5줄 중앙값).
 const runEdge=(y:number,side:0|1)=>median([-2,-1,0,1,2].map(d=>central(clampY(y+d))).filter((r):r is [number,number]=>r!==null).map(r=>r[side]));
 const armEdge:[number,number]=[median([3,4,5,6,7,8].map(d=>runEdge(armpit+d,0))),median([3,4,5,6,7,8].map(d=>runEdge(armpit+d,1)))];
 const half=chest*clamp(shoulderToChest,.6,1.4)/2;
 const firstRow=(x:number)=>{const xi=clamp(Math.round(x),box.x0,box.x1);for(let y=box.y0;y<=armpit;y++)if(mask[y*width+xi])return y;return box.y0;};
 const shoulders:[Pt,Pt]=[[cx-half,firstRow(cx-half)],[cx+half,firstRow(cx+half)]];
 // 몸판 가장자리: 겨드랑이 아래는 몸판 덩어리 끝, 어깨점~겨드랑이는 두 점을 잇는 직선(진동 둘레), 어깨점 위(어깨 경사·목)는 덩어리 끝을 어깨점 안쪽으로 제한.
 const edge=(y:number,side:0|1)=>{
  if(y>=armpit+3){const v=runEdge(y,side);return Number.isFinite(v)?v:armEdge[side];}
  const [sx,sy]=shoulders[side];
  if(y>=sy)return lerp(sx,armEdge[side],clamp((y-sy)/Math.max(1,armpit+3-sy),0,1));
  const v=runEdge(y,side);if(!Number.isFinite(v))return sx;
  return side===0?Math.max(v,sx):Math.min(v,sx);
 };
 const torso:Span[]=Array.from({length:TOP_ROWS},(_,k)=>{const y=box.y0+(box.y1-box.y0)*k/(TOP_ROWS-1);return [edge(y,0),edge(y,1)];});
 // 소매: 몸판 가장자리 바깥의 옷 픽셀(겨드랑이 아래 옷 높이의 35%까지). 진동 둘레 가운데에서 소매 무게중심 쪽이 소매 방향(d)이고,
 // 소매단 위 모서리는 바깥+위(d+n), 아래 모서리는 바깥+아래(d−n) 방향으로 가장 먼 픽셀이다(사다리꼴 소매의 두 끝).
 let total=0;for(let i=0;i<mask.length;i++)total+=mask[i];
 const lowest=Math.min(box.y1,armpit+Math.round((box.y1-box.y0)*.35));
 const sleeve=(side:0|1):SleeveQuad|null=>{
  const sign=side?1:-1,points:Pt[]=[];
  for(let y=box.y0;y<=lowest;y++){const e=edge(y,side);for(let x=Math.round(e)+sign*2;x>=box.x0&&x<=box.x1;x+=sign)if(mask[y*width+x])points.push([x,y]);}
  if(points.length<Math.max(30,total*.005))return null;
  const shoulder=shoulders[side],arm:Pt=[armEdge[side],armpit],mid:Pt=[(shoulder[0]+arm[0])/2,(shoulder[1]+arm[1])/2];
  let mx=0,my=0;for(const [x,y] of points){mx+=x;my+=y;}mx/=points.length;my/=points.length;
  let dx=mx-mid[0],dy=my-mid[1];const len=Math.hypot(dx,dy);if(len<2)return null;dx/=len;dy/=len;
  // 소매단 쪽 수직 방향은 어깨점 쪽을 향하게 한다.
  let nx=-dy,ny=dx;if((shoulder[0]-arm[0])*nx+(shoulder[1]-arm[1])*ny<0){nx=-nx;ny=-ny;}
  let far=0,top:Pt=points[0],bottom:Pt=points[0],up=-Infinity,down=-Infinity;
  for(const p of points){
   const a=(p[0]-mid[0])*dx+(p[1]-mid[1])*dy,n=(p[0]-mid[0])*nx+(p[1]-mid[1])*ny;far=Math.max(far,a);
   if(a+n>up){up=a+n;top=p;}if(a-n>down){down=a-n;bottom=p;}
  }
  return far>4?{shoulder,armpit:arm,cuffTop:top,cuffBottom:bottom}:null;
 };
 return {layout:{kind:'top',width,height,top:box.y0,bottom:box.y1,armpit,torso,sleeves:[sleeve(0),sleeve(1)]},reason:''};
}

export function analyzeBottomLayout(cutout:GarmentCutout):{layout:BottomLayout|null;reason:string}{
 const located=locateBottom(cutout);if(!located.frame)return {layout:null,reason:located.reason};
 const {cx,crotch,runsAt,legsAt}=located.frame,{box,width,height}=cutout;
 const seatRun=(y:number)=>{const runs=runsAt(y);return runs.find(r=>r[0]<=cx&&r[1]>=cx)??runs.reduce<[number,number]|null>((a,b)=>!a||b[1]-b[0]>a[1]-a[0]?b:a,null);};
 const smoothSpan=(get:(y:number)=>Span|null,y:number,fallback:Span):Span=>{const spans=[-2,-1,0,1,2].map(d=>get(y+d)).filter((s):s is Span=>s!==null);return spans.length?[median(spans.map(s=>s[0])),median(spans.map(s=>s[1]))]:fallback;};
 let lastSeat:Span=[box.x0,box.x1];
 const seat:Span[]=Array.from({length:SEAT_ROWS},(_,k)=>{const y=Math.round(box.y0+(crotch-box.y0)*k/(SEAT_ROWS-1));lastSeat=smoothSpan(seatRun,y,lastSeat);return lastSeat;});
 let lastLegs:[Span,Span]=[[box.x0,cx-1],[cx+1,box.x1]];
 const legs:Array<[Span,Span]>=Array.from({length:LEG_ROWS},(_,k)=>{
  const y=Math.round(crotch+(box.y1-crotch)*k/(LEG_ROWS-1));
  const left=smoothSpan(v=>legsAt(v)?.[0]??null,y,lastLegs[0]),right=smoothSpan(v=>legsAt(v)?.[1]??null,y,lastLegs[1]);
  lastLegs=[left,right];return lastLegs;
 });
 return {layout:{kind:'bottom',width,height,top:box.y0,bottom:box.y1,crotch,seat,legs},reason:''};
}

// 몸 둘레 방향 phi(0=+x, π/2=앞, π=-x, 3π/2=뒤)를 펼친 앞판(0=+x쪽 끝 → 1=-x쪽 끝)·뒤판(0=-x쪽 끝 → 1=+x쪽 끝) 위치로 바꾼다.
// 반대편 면의 점은 가까운 옆선으로 붙인다(옆선을 걸친 삼각형이 사진 가장자리 색을 쓰게).
export function frontFraction(phi:number){const p=wrap(phi);return p<=Math.PI?p/Math.PI:p>1.5*Math.PI?0:1;}
export function backFraction(phi:number){const p=wrap(phi);return p>=Math.PI?(p-Math.PI)/Math.PI:p<.5*Math.PI?1:0;}

// 앞 사진의 앞 목선을 잰다. 목 옆 점(HPS)은 가운데 양쪽에서 옷 위끝이 가장 높은 곳이고, 가운데 줄을 위에서부터 내려가며 색이 목 옆
// 바로 바깥 앞판과 다른 줄(목둘레 안으로 보이는 뒤판 안쪽)이 끝나는 곳이 앞 목선이다. 구분되지 않으면(검은 옷의 검은 안감 등) null.
export function measureFrontNeck(pixels:ArrayLike<number>,mask:Uint8Array,layout:TopLayout):FrontNeck|null{
 const {width,top,bottom}=layout,length=bottom-top,[chestL,chestR]=rowAt(layout.torso,(layout.armpit-top)/Math.max(1,length)+.05),chest=chestR-chestL,cx=(chestL+chestR)/2;
 if(chest<20)return null;
 const topRow=(x:number)=>{const xi=Math.round(x);for(let y=top;y<top+length*.4;y++)if(mask[y*width+xi])return y;return Infinity;};
 // 가운데에서 바깥으로 가며 옷 위끝이 가장 높은 줄에 닿는 가장 바깥 열(그 너머는 어깨 경사로 내려간다).
 const hps=(sign:1|-1)=>{const rows:Array<[number,number]>=[];for(let d=chest*.04;d<chest*.4;d++)rows.push([d,topRow(cx+sign*d)]);const highest=Math.min(...rows.map(r=>r[1]));let best=0;for(const [d,r] of rows)if(r<=highest)best=d;return cx+sign*best;};
 const left=hps(-1),right=hps(1),half=(right-left)/2;if(half<chest*.08)return null;
 const average=(x0:number,x1:number,y:number)=>{let r=0,g=0,b=0,n=0;for(let x=Math.round(x0);x<=Math.round(x1);x++){const i=(y*width+x)*4;if(!mask[y*width+x])continue;r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];n++;}return n?[r/n,g/n,b/n]:null;};
 const center=(y:number)=>average(cx-chest*.03,cx+chest*.03,y);
 const outside=(y:number)=>{const a=average(left-chest*.07,left-chest*.025,y),b=average(right+chest*.025,right+chest*.07,y);return a&&b?a.map((v,i)=>(v+b[i])/2):a??b;};
 let inside=0,end=-1;
 for(let y=top+1;y<top+length*.35;y++){
  const c=center(y),o=outside(y);if(!c||!o)continue;
  const different=Math.hypot(c[0]-o[0],c[1]-o[1],c[2]-o[2])>28;
  if(different)inside++;else if(inside>=Math.max(2,length*.01)){end=y;break;}else if(y>top+length*.06)break;
 }
 if(end<0)return null;
 const depth=end-top;
 return depth>length*.02&&depth<length*.35?{cx:(left+right)/2,depth,half}:null;
}

// 상의 몸판 위 점. t: 옷 위끝(목 옆 높이)에서 밑단까지의 비율. 사진 x는 앞판이면 오른쪽 끝(+x)에서, 뒤판이면 오른쪽 끝(-x)에서 시작한다.
// neckDepth: 그 방향 3D 앞 목선이 위끝보다 내려온 비율. 앞 사진의 목선(neck)을 쟀으면 3D 목선이 사진 목선에 오도록 위아래를 다시 나눠,
// 목둘레 안으로 보이는 뒤판 안쪽이 3D 앞판에 찍히지 않게 한다.
export function torsoPoint(layout:TopLayout,view:View,t:number,phi:number,neckDepth=0):Pt{
 const [left,right]=rowAt(layout.torso,t),w=view==='front'?frontFraction(phi):backFraction(phi),x=right-(right-left)*w;
 const {top,bottom,neck}=layout,length=bottom-top;
 if(view!=='front'||!neck)return [x,lerp(top,bottom,clamp(t,0,1))];
 const across=(x-neck.cx)/neck.half,photoNeck=top+(Math.abs(across)<1?neck.depth*Math.pow(1-across*across,.9):0),n=clamp(neckDepth,0,.6),u=clamp(t,0,1);
 // 목선 아래로는 차이(shift)를 목선 근처 띠(span)에서만 서서히 없애, 가슴 아래 줄무늬·프린트 높이는 그대로 둔다(span은 단조 증가가 유지되게 shift의 2.2배 이상).
 const shift=photoNeck-(top+n*length),span=Math.max(.12,2.2*Math.abs(shift)/Math.max(1,length));
 const y=u<n?photoNeck-(n-u)*length:top+u*length+shift*(1-smoothstep01((u-n)/span));
 return [x,clamp(y,top,bottom)];
}
const smoothstep01=(v:number)=>{const s=clamp(v,0,1);return s*s*(3-2*s);};

// 마스크를 radius px 깎는다(옷 가장자리의 배경과 섞인 픽셀을 텍스처에서 빼고 안쪽 옷 색으로 채우기 위함).
export function erodeMask(mask:Uint8Array,width:number,height:number,radius=2){
 let current=mask;
 for(let r=0;r<radius;r++){
  const next=Uint8Array.from(current);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(!current[i])continue;if(x===0||y===0||x===width-1||y===height-1||!current[i-1]||!current[i+1]||!current[i-width]||!current[i+width])next[i]=0;}
  current=next;
 }
 return current;
}
// 소매 위 점. wearerSide: 착용자 왼쪽(+1, +x) 또는 오른쪽(-1) 소매. along: 진동 둘레(0)~소매단(1), q: 소매 위끝(어깨점 쪽, 0)~아래(겨드랑이 쪽, 1).
export function sleevePoint(layout:TopLayout,view:View,wearerSide:1|-1,along:number,q:number):Pt{
 const index=(view==='front')===(wearerSide>0)?1:0,quad=layout.sleeves[index];
 if(!quad)return torsoPoint(layout,view,(layout.armpit-layout.top)/Math.max(1,layout.bottom-layout.top),wearerSide>0?0:Math.PI);
 const a=clamp(along,0,1),b=clamp(q,0,1);
 const seam:Pt=[lerp(quad.shoulder[0],quad.armpit[0],b),lerp(quad.shoulder[1],quad.armpit[1],b)],cuff:Pt=[lerp(quad.cuffTop[0],quad.cuffBottom[0],b),lerp(quad.cuffTop[1],quad.cuffBottom[1],b)];
 return [lerp(seam[0],cuff[0],a),lerp(seam[1],cuff[1],a)];
}
// 바지 엉덩이(허리~가랑이) 위 점. t: 허리(0)~가랑이(1).
export function seatPoint(layout:BottomLayout,view:View,t:number,phi:number):Pt{
 const [left,right]=rowAt(layout.seat,t),w=view==='front'?frontFraction(phi):backFraction(phi);
 return [right-(right-left)*w,lerp(layout.top,layout.crotch,clamp(t,0,1))];
}
// 바지 다리 위 점. t: 가랑이(0)~밑단(1). theta: 다리 둘레 방향(0=바깥 옆선, π/2=앞, ±π=안쪽 솔기, -π/2=뒤).
export function legPoint(layout:BottomLayout,view:View,wearerSide:1|-1,t:number,theta:number):Pt{
 const p=Math.atan2(Math.sin(theta),Math.cos(theta));
 const w=view==='front'?(p>=0?p/Math.PI:p>-Math.PI/2?0:1):(p<=0?-p/Math.PI:p<Math.PI/2?0:1);
 const index=(view==='front')===(wearerSide>0)?1:0,row=rowAt(layout.legs.map(([l,r])=>[l[0],l[1],r[0],r[1]]),t);
 const [l0,l1]=index?[row[2],row[3]]:[row[0],row[1]];
 // 사진 오른쪽 다리(index 1)는 바깥 옆선이 오른쪽 끝, 왼쪽 다리는 왼쪽 끝이다.
 return [index?l1-(l1-l0)*w:l0+(l1-l0)*w,lerp(layout.crotch,layout.bottom,clamp(t,0,1))];
}
// 사진 픽셀 → 텍스처 좌표(u 오른쪽, v 위쪽).
export const toUV=(layout:PhotoLayout,[x,y]:Pt):[number,number]=>[(x+.5)/layout.width,1-(y+.5)/layout.height];

// 옷 밖(배경) 픽셀을 가장 가까운 옷 색으로 번지게 채운다. 3D에서 사진 가장자리를 쓸 때 배경색이 새어 나오지 않게 한다.
// 남은 곳은 옷 평균색. pixels(RGBA)를 그 자리에서 바꾸고 옷 평균색 [r,g,b]를 돌려준다.
export function bleedBackground(pixels:Uint8ClampedArray,mask:Uint8Array,width:number,height:number,passes=24):[number,number,number]{
 const filled=Uint8Array.from(mask);let r=0,g=0,b=0,n=0;
 for(let i=0;i<filled.length;i++)if(filled[i]){r+=pixels[i*4];g+=pixels[i*4+1];b+=pixels[i*4+2];n++;}
 const average:[number,number,number]=n?[r/n,g/n,b/n]:[128,128,128];
 let frontier:number[]=[];
 for(let i=0;i<filled.length;i++)if(!filled[i]){const x=i%width,y=(i-x)/width;if((x>0&&filled[i-1])||(x<width-1&&filled[i+1])||(y>0&&filled[i-width])||(y<height-1&&filled[i+width]))frontier.push(i);}
 for(let pass=0;pass<passes&&frontier.length;pass++){
  const done:number[]=[];
  for(const i of frontier){if(filled[i])continue;const x=i%width,y=(i-x)/width;let sr=0,sg=0,sb=0,c=0;
   for(const j of [x>0?i-1:-1,x<width-1?i+1:-1,y>0?i-width:-1,y<height-1?i+width:-1])if(j>=0&&filled[j]){sr+=pixels[j*4];sg+=pixels[j*4+1];sb+=pixels[j*4+2];c++;}
   if(c){pixels[i*4]=sr/c;pixels[i*4+1]=sg/c;pixels[i*4+2]=sb/c;pixels[i*4+3]=255;done.push(i);}}
  for(const i of done)filled[i]=2;
  const next=new Set<number>();
  for(const i of done){const x=i%width,y=(i-x)/width;for(const j of [x>0?i-1:-1,x<width-1?i+1:-1,y>0?i-width:-1,y<height-1?i+width:-1])if(j>=0&&!filled[j])next.add(j);}
  frontier=[...next];
 }
 for(let i=0;i<filled.length;i++)if(!filled[i]){pixels[i*4]=average[0];pixels[i*4+1]=average[1];pixels[i*4+2]=average[2];pixels[i*4+3]=255;}
 return average;
}

// 뒤 사진이 없을 때 앞 사진으로 뒤판을 만든다. 줄마다 몸판(바지는 엉덩이·각 다리) 옆쪽 띠를 좌우로 거울 반복해 채워,
// 줄무늬·체크·원단 색은 그 높이 그대로 두고 가슴 프린트·단추·지퍼처럼 가운데에 있는 앞면 장식은 뒤에 옮기지 않는다. 소매는 그대로 둔다.
// 상의는 폭 가득한 프린트가 옆쪽 띠(10~28%)까지 닿을 수 있어, 그 띠의 평균색이 옆선 바로 안쪽(3~7%) 원단 색과 크게 다르면
// 그 줄은 옆선 쪽 좁은 띠(2~7%)로 채운다(줄무늬는 줄 전체가 같은 색이라 그대로 넓은 띠를 쓴다).
export function synthesizeBack(pixels:Uint8ClampedArray,layout:PhotoLayout):Uint8ClampedArray<ArrayBuffer>{
 const out=new Uint8ClampedArray(pixels),{width}=layout;
 const tile=(y:number,[left,right]:Span,from:number,to:number)=>{
  const l=Math.round(left),r=Math.round(right),bandStart=Math.round(left+(right-left)*from),band=Math.max(2,Math.round((right-left)*(to-from)));
  for(let x=l;x<=r;x++){const o=x-l,k=Math.floor(o/band),w=o%band,src=clamp(bandStart+(k%2?band-1-w:w),0,width-1);for(let c=0;c<4;c++)out[(y*width+x)*4+c]=pixels[(y*width+src)*4+c];}
 };
 // 줄 y에서 몸판 폭의 from~to 구간(양쪽 옆선에서 같은 거리) 평균색.
 const bandColor=(y:number,[left,right]:Span,from:number,to:number)=>{
  const sum=[0,0,0];let n=0;
  for(const [a,b] of [[left+(right-left)*from,left+(right-left)*to],[right-(right-left)*to,right-(right-left)*from]])
   for(let x=Math.round(a);x<=Math.round(b);x++){const i=(y*width+clamp(x,0,width-1))*4;sum[0]+=pixels[i];sum[1]+=pixels[i+1];sum[2]+=pixels[i+2];n++;}
  return sum.map(v=>v/Math.max(1,n));
 };
 if(layout.kind==='top'){
  for(let y=layout.top;y<=layout.bottom;y++){
   const span=rowAt(layout.torso,(y-layout.top)/Math.max(1,layout.bottom-layout.top)),wide=bandColor(y,span,.1,.28),seam=bandColor(y,span,.03,.07);
   const printed=Math.hypot(wide[0]-seam[0],wide[1]-seam[1],wide[2]-seam[2])>45;
   if(printed)tile(y,span,.02,.07);else tile(y,span,.1,.28);
  }
 }else{
  for(let y=layout.top;y<=layout.crotch;y++)tile(y,rowAt(layout.seat,(y-layout.top)/Math.max(1,layout.crotch-layout.top)),.12,.3);
  for(let y=layout.crotch;y<=layout.bottom;y++){const row=rowAt(layout.legs.map(([l,r])=>[l[0],l[1],r[0],r[1]]),(y-layout.crotch)/Math.max(1,layout.bottom-layout.crotch));tile(y,[row[0],row[1]],.3,.7);tile(y,[row[2],row[3]],.3,.7);}
 }
 return out;
}
