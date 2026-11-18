// 아바타 머리카락 형태. 지금 체형의 마네킹 머리를 높이별로 잘라 방향마다 머리 반지름을 재고, 그 위에 머리카락 껍질을 만든다.
// - 정수리 쪽은 두개골 중심에서 바깥 방향으로 부풀린다(머리 표면을 따라감).
// - 귀처럼 좁게 튀어나온 곳은 주변 방향·높이의 최댓값으로 넓힌 뒤 다듬어, 머리카락이 뚫리지 않고 부드럽게 넘어가게 한다.
// - 짧은 머리는 두피를 따라 붙고(귀 위로 둘러 깎은 선), 단발은 귀 위 두개골 높이(HANG_DROP) 아래로 그 반지름보다
//   안쪽으로 들어가지 않게 해서 곧게 늘어진다(목·턱에 붙지 않음).
// - 끝으로 갈수록 두께를 줄여 머리선이 피부에 자연스럽게 닿게 하고, 단발은 끝을 살짝 안으로 말아 넣는다.
// - 머리카락이 끝나는 높이(앞머리선·옆선·뒷머리 길이)는 스타일마다 방향(앞 0° ~ 뒤 180°)별 표로 정한다.
// 모자를 쓰면 모자 테두리 아래로만 만든다. 표시용 형태이며 천 시뮬레이션·핏 계산에는 쓰지 않는다.
// 좌표는 mannequin-mesh.ts morphedPositions()와 같다(발바닥 y=0, 정수리 y=키, +z 앞).

export type HairStyle='short'|'bob';
export type HairGeometry={positions:Float32Array;uvs:Float32Array;indices:Uint32Array;top:number;center:{x:number;z:number}};

// [방향(°, 앞 0 → 뒤 180), 정수리에서 머리카락 끝까지의 깊이(175cm 키 기준 m)]
const STYLE_DEPTH:Record<HairStyle,Array<[number,number]>>={
 // 이마를 드러내고(가운데가 살짝 내려온 M자 머리선), 귀 앞 구레나룻(74°)을 지나 귀(약 85~110°) 위로 둘러 깎고, 뒷머리는 목덜미까지.
 short:[[0,.060],[16,.056],[30,.066],[45,.088],[60,.104],[74,.134],[84,.110],[96,.104],[108,.108],[118,.132],[135,.158],[155,.176],[180,.186]],
 // 이마 위에서 시작해 관자놀이에서 내려와 귀를 덮고 턱선까지.
 bob:[[0,.062],[20,.066],[34,.094],[48,.180],[62,.205],[90,.212],[140,.220],[180,.224]],
};
// 단발처럼 아래로 늘어지는 스타일.
const HANGS:Record<HairStyle,boolean>={short:false,bob:true};
// HANG_DROP: 늘어지기 시작하는 깊이. EAR_DROP: 이 깊이 아래로는 높이 방향으로도 넓혀 귀를 감싼다(위쪽 정수리는 높이에 따라 반지름이 빨리 변해 제외).
const AZIMUTHS=96,ROWS=34,REFERENCE=1.75,HANG_DROP=.105,EAR_DROP=.09;

const smoothstep=(e0:number,e1:number,x:number)=>{const t=Math.min(1,Math.max(0,(x-e0)/(e1-e0)));return t*t*(3-2*t);};

// 방향 phi(라디안)에서 머리카락이 끝나는 깊이. 표 사이는 코사인 보간, 좌우 대칭.
export function hairDepth(style:HairStyle,phi:number){
 const table=STYLE_DEPTH[style],deg=Math.abs(((phi*180/Math.PI+540)%360)-180);
 for(let i=1;i<table.length;i++){
  const [a0,d0]=table[i-1],[a1,d1]=table[i];
  if(deg<=a1){const t=(deg-a0)/(a1-a0),s=(1-Math.cos(Math.PI*t))/2;return d0+(d1-d0)*s;}
 }
 return table[table.length-1][1];
}

// 높이 y에서 머리 부분 삼각형을 자른 선분들 [x1,z1,x2,z2, ...].
function slice(positions:Float32Array,triangles:Uint32Array,y:number){
 const out:number[]=[];
 for(let t=0;t<triangles.length;t+=3){
  const pts:number[]=[];
  for(let e=0;e<3;e++){
   const a=triangles[t+e]*3,b=triangles[t+(e+1)%3]*3,ya=positions[a+1],yb=positions[b+1];
   if((ya-y)*(yb-y)>0||ya===yb)continue;
   const s=(y-ya)/(yb-ya);pts.push(positions[a]+(positions[b]-positions[a])*s,positions[a+2]+(positions[b+2]-positions[a+2])*s);
  }
  if(pts.length>=4)out.push(pts[0],pts[1],pts[2],pts[3]);
 }
 return out;
}

// 중심 (cx,cz)에서 방향 (dx,dz)로 쏜 반직선이 선분들과 만나는 가장 먼 거리. 없으면 NaN.
function farthestHit(segments:number[],cx:number,cz:number,dx:number,dz:number){
 let best=NaN;
 for(let s=0;s<segments.length;s+=4){
  const x1=segments[s]-cx,z1=segments[s+1]-cz,x2=segments[s+2]-cx,z2=segments[s+3]-cz,ex=x2-x1,ez=z2-z1;
  const det=dx*ez-dz*ex;if(Math.abs(det)<1e-12)continue;
  const t=(x1*ez-z1*ex)/det,u=(x1*dz-z1*dx)/det;
  if(t>0&&u>=0&&u<=1&&!(t<=best))best=t;
 }
 return best;
}

// positions: 체형을 적용한 마네킹 정점(morphedPositions), indices: 마네킹 삼각형. hatBase: 모자를 썼을 때 모자 테두리 높이(m).
export function buildHair(positions:Float32Array,indices:Uint32Array,style:HairStyle,options:{hatBase?:number}={}):HairGeometry|null{
 let top=-Infinity;for(let i=1;i<positions.length;i+=3)top=Math.max(top,positions[i]);
 if(!Number.isFinite(top))return null;
 const k=top/REFERENCE,H=top,lowest=H-.24*k;
 // 머리·목 부분 삼각형(손·어깨는 이 높이와 폭 밖에 있다).
 const head:number[]=[];
 for(let t=0;t<indices.length;t+=3){
  let ok=true;for(let e=0;e<3;e++){const v=indices[t+e]*3;if(positions[v+1]<lowest||Math.abs(positions[v])>.17*k){ok=false;break;}}
  if(ok)head.push(indices[t],indices[t+1],indices[t+2]);
 }
 const tris=Uint32Array.from(head);if(!tris.length)return null;
 // 머리 축: 두개골 높이 단면의 가운데.
 const mid=slice(positions,tris,H-.085*k);if(mid.length<8)return null;
 let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(let i=0;i<mid.length;i+=2){x0=Math.min(x0,mid[i]);x1=Math.max(x1,mid[i]);z0=Math.min(z0,mid[i+1]);z1=Math.max(z1,mid[i+1]);}
 const cx=(x0+x1)/2,cz=(z0+z1)/2;
 // 방향별 머리 반지름 표(높이 단계 3mm×키 비율).
 const step=.003*k,rows:number[]=[];for(let y=H-.0015;y>lowest+.002;y-=step)rows.push(y);
 const dirs=Array.from({length:AZIMUTHS},(_,i)=>{const phi=i/AZIMUTHS*Math.PI*2;return [Math.sin(phi),Math.cos(phi)] as const;});
 const rho:Float64Array[]=rows.map(y=>{
  const segments=slice(positions,tris,y),row=new Float64Array(AZIMUTHS);
  dirs.forEach(([dx,dz],i)=>{row[i]=farthestHit(segments,cx,cz,dx,dz);});
  return row;
 });
 // 빈 칸은 위 줄 값으로 채운다.
 for(let j=0;j<rows.length;j++)for(let i=0;i<AZIMUTHS;i++)if(!Number.isFinite(rho[j][i]))rho[j][i]=j?rho[j-1][i]:0;
 const rowOf=(drop:number)=>Math.min(rows.length-1,Math.max(0,Math.round((drop*k-.0015)/step)));
 const earRow=rowOf(EAR_DROP),hangRow=rowOf(HANG_DROP);
 // 귀처럼 좁게 튀어나온 곳: 이웃 방향(±2칸, 약 ±7.5°)과 귀 높이 아래 이웃 높이(±3줄)의 최댓값으로 넓힌 뒤, 높이·방향으로 다듬는다.
 // 귀를 덮는 단발은 방향으로 더 넓게(±4칸) 넓히고 더 다듬어, 귀 자리가 둥근 혹이 아니라 옆머리가 완만하게 불룩한 모양이 되게 한다.
 const around=(i:number)=>(i+AZIMUTHS)%AZIMUTHS,covers=(j:number)=>HANGS[style]&&j>=earRow;
 rho.forEach((row,j)=>{const copy=Float64Array.from(row),reach=covers(j)?4:2;for(let i=0;i<AZIMUTHS;i++)for(let d=-reach;d<=reach;d++)row[i]=Math.max(row[i],copy[around(i+d)]);});
 let copy=rho.map(row=>Float64Array.from(row));
 for(let j=earRow;j<rows.length;j++)for(let d=-3;d<=3;d++){const jj=j+d;if(jj<earRow||jj>=rows.length)continue;for(let i=0;i<AZIMUTHS;i++)rho[j][i]=Math.max(rho[j][i],copy[jj][i]);}
 for(let pass=0;pass<2;pass++){copy=rho.map(row=>Float64Array.from(row));for(let j=earRow+1;j<rows.length-1;j++)for(let i=0;i<AZIMUTHS;i++)rho[j][i]=(copy[j-1][i]+2*copy[j][i]+copy[j+1][i])/4;}
 const smooth=(row:Float64Array)=>{const before=Float64Array.from(row);for(let i=0;i<AZIMUTHS;i++)row[i]=(before[around(i-1)]+2*before[i]+before[around(i+1)])/4;};
 rho.forEach((row,j)=>{const passes=covers(j)?8:j>=earRow?3:1;for(let p=0;p<passes;p++)smooth(row);});
 // 단발: 두개골이 가장 넓은 높이 아래로는 그 반지름보다 안쪽으로 들어가지 않고(곧게 늘어짐), 귀를 넘은 머리카락은
 // 한 줄 내려갈 때 줄 간격의 0.3배까지만 안쪽으로 들어온다(귀 아래가 움푹 꺼지지 않고 천천히 떨어짐).
 // 귀 위쪽도 아래에서부터 줄 간격의 0.45배 기울기로 올라가며 넓혀 귀로 넘어가는 시작을 완만하게 한다.
 if(HANGS[style]){
  for(let j=rows.length-2;j>=earRow;j--)for(let i=0;i<AZIMUTHS;i++)rho[j][i]=Math.max(rho[j][i],rho[j+1][i]-.45*step);
  for(let j=hangRow+1;j<rows.length;j++)for(let i=0;i<AZIMUTHS;i++)rho[j][i]=Math.max(rho[j][i],rho[hangRow][i],rho[j-1][i]-.3*step);
 }
 const radiusAt=(i:number,y:number)=>{
  const f=Math.min(rows.length-1,Math.max(0,(H-.0015-y)/step)),j=Math.floor(f),t=f-j,j1=Math.min(rows.length-1,j+1);
  return rho[j][i]*(1-t)+rho[j1][i]*t;
 };
 const cranium={x:cx,y:H-.095*k,z:cz};
 // 머리카락 두께: 정수리 쪽이 더 풍성하고, 단발은 아래로 갈수록 살짝 퍼진다.
 const thickness=(y:number)=>(.006+.009*smoothstep(H-.11*k,H-.01*k,y)+(style==='bob'?.004*smoothstep(H-.13*k,H-.22*k,y):0))*k;
 // t: 머리카락 시작(0)에서 끝(1)까지의 위치. 끝 18%에서 두께를 줄여 머리선이 피부에 닿게 하고, 단발은 끝을 안으로 만다.
 const point=(i:number,y:number,t:number):[number,number,number]=>{
  const tuck=HANGS[style]&&y<H-HANG_DROP*k?1-.07*smoothstep(.72,1,t):1;
  const [dx,dz]=dirs[i%AZIMUTHS],r=radiusAt(i%AZIMUTHS,y)*tuck,hx=cx+r*dx,hz=cz+r*dz;
  // 위쪽은 두개골 중심에서 바깥으로, 아래쪽은 수평으로 부풀린다.
  const w=smoothstep(H-.13*k,H-.09*k,y);
  let ox=w*(hx-cranium.x),oy=w*(y-cranium.y),oz=w*(hz-cranium.z);const len=Math.hypot(ox,oy,oz)||1;ox/=len;oy/=len;oz/=len;
  ox=ox*w+dx*(1-w);oy=oy*w;oz=oz*w+dz*(1-w);const len2=Math.hypot(ox,oy,oz)||1;
  const off=thickness(y)*(1-.82*smoothstep(.82,1,t));return [hx+ox/len2*off,y+oy/len2*off,hz+oz/len2*off];
 };
 const startY=options.hatBase!==undefined?Math.min(H-.0015,options.hatBase+.004):H-.0015;
 const ends=Array.from({length:AZIMUTHS},(_,i)=>{const end=H-hairDepth(style,i/AZIMUTHS*Math.PI*2)*k;return Math.min(startY,end);});
 if(ends.every(e=>e>=startY-.004))return null;
 const positionsOut:number[]=[],uvs:number[]=[],out:number[]=[];
 const capped=options.hatBase===undefined;
 // 정수리 꼭짓점(모자를 쓰면 없음).
 if(capped){positionsOut.push(cx,H+thickness(H)*.95,cz);uvs.push(.5,0);}
 const base=positionsOut.length/3,cols=AZIMUTHS+1;
 for(let r=0;r<=ROWS;r++){
  const t=Math.pow(r/ROWS,1.25);
  for(let c=0;c<cols;c++){const i=c%AZIMUTHS,y=startY-(startY-ends[i])*t;positionsOut.push(...point(i,y,t));uvs.push(c/AZIMUTHS,t);}
 }
 if(capped)for(let c=0;c<AZIMUTHS;c++)out.push(0,base+c+1,base+c);
 for(let r=0;r<ROWS;r++)for(let c=0;c<AZIMUTHS;c++){const a=base+r*cols+c,b=a+cols;out.push(a,a+1,b,a+1,b+1,b);}
 return {positions:Float32Array.from(positionsOut),uvs:Float32Array.from(uvs),indices:Uint32Array.from(out),top:H,center:{x:cx,z:cz}};
}
