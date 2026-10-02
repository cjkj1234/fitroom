import type {BodyProfile} from './types';
import {SECTION_ROWS,SECTION_START,SECTION_STEP,SECTION_TARGETS} from './mannequin-sections';

// 마네킹 모프 7종. 가중치 공식은 docs/assets/MAKEHUMAN.md의 보정표(중립 치수, 가중치 1당 변화량)를 따른다.
export const MORPH_TARGETS=['chest','waist','hips','shoulders','armLength','legLength','head'] as const;
export type MorphTarget=typeof MORPH_TARGETS[number];
export type MorphWeights=Record<MorphTarget,number>;
const NEUTRAL:Record<MorphTarget,[number,number]>={chest:[96,50],waist:[80,60],hips:[98,55],shoulders:[43,10],armLength:[59,15],legLength:[105,20],head:[57,13]};
const KEY:Record<MorphTarget,keyof BodyProfile['measurements']>={chest:'chest',waist:'waist',hips:'hips',shoulders:'shoulders',armLength:'armLength',legLength:'legLength',head:'head'};

// 키를 175cm로 되돌린 치수로 가중치를 구한다. 아바타(avatar-view)와 옷 형태가 같은 값을 쓴다.
export function morphWeights(body:BodyProfile):MorphWeights{
 const scale=body.measurements.height/175,out={} as MorphWeights;
 for(const name of MORPH_TARGETS){const [neutral,perWeight]=NEUTRAL[name];out[name]=Math.max(-1,Math.min(1,(body.measurements[KEY[name]]/scale-neutral)/perWeight));}
 return out;
}

// 높이 y(m, 현재 키 기준)의 몸 단면. perimeter는 줄자로 잰 둘레(볼록 껍질), rx·rz는 반폭·반깊이, x·z는 단면 중심.
// arm은 오른팔 단면이다(왼팔은 x를 뒤집어 쓴다). armhole은 1.20~1.48m(175cm 기준)에서 x≥17cm인 몸 표면의 범위로,
// 소매가 붙는 진동 둘레의 앞뒤 깊이를 정할 때 쓴다(perimeter는 0).
export type BodySection={perimeter:number;rx:number;rz:number;x:number;z:number};
export type BodyShape={torso:(y:number)=>BodySection|null;leg:(y:number)=>BodySection|null;arm:(y:number)=>BodySection|null;armhole:(y:number)=>BodySection|null;neutralTorso:(y:number)=>BodySection|null;neutralLeg:(y:number)=>BodySection|null};

// mannequin-sections.ts는 175cm 마네킹을 높이별로 잘라 잰 중립 단면과, 모프 하나를 ±1로 줬을 때의 변화량이다.
// 모프는 정점을 선형으로 옮기므로 단면도 가중치에 거의 선형으로 변한다(양수·음수 방향은 따로 잰다).
type Row=(typeof SECTION_ROWS)[number];
type Part='torso'|'leg'|'arm'|'armhole';
function sectionOf(row:Row,part:Part,weights:MorphWeights|null):BodySection|null{
 const base=row[part];if(!base)return null;
 const value=[...base];
 if(weights)SECTION_TARGETS.forEach((name,t)=>{const w=weights[name];if(!w)return;const delta=(w>0?row.plus:row.minus)[part]?.[t];if(!delta)return;for(let i=0;i<5;i++)value[i]+=Math.abs(w)*delta[i];});
 const [perimeter,rx,rz,x,z]=value;return {perimeter,rx,rz,x,z};
}
function lerpSection(a:BodySection|null,b:BodySection|null,t:number):BodySection|null{
 if(!a||!b)return t<.5?a??b:b??a;
 return {perimeter:a.perimeter+(b.perimeter-a.perimeter)*t,rx:a.rx+(b.rx-a.rx)*t,rz:a.rz+(b.rz-a.rz)*t,x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
}
export function bodyShape(body:BodyProfile):BodyShape{
 const k=body.measurements.height/175,weights=morphWeights(body);
 const at=(part:Part,w:MorphWeights|null)=>(y:number)=>{
  const f=(y/k-SECTION_START)/SECTION_STEP;if(f<0||f>SECTION_ROWS.length-1)return null;
  const i=Math.min(SECTION_ROWS.length-2,Math.floor(f)),s=lerpSection(sectionOf(SECTION_ROWS[i],part,w),sectionOf(SECTION_ROWS[i+1],part,w),f-i);
  return s&&{perimeter:s.perimeter*k,rx:s.rx*k,rz:s.rz*k,x:s.x*k,z:s.z*k};
 };
 return {torso:at('torso',weights),leg:at('leg',weights),arm:at('arm',weights),armhole:at('armhole',weights),neutralTorso:at('torso',null),neutralLeg:at('leg',null)};
}

// 타원 둘레(라마누잔 근사). 옷 고리의 둘레를 몸 둘레와 비교할 때 쓴다.
export function ellipsePerimeter(rx:number,rz:number){const h=Math.pow(rx-rz,2)/Math.pow(rx+rz,2);return Math.PI*(rx+rz)*(1+3*h/(10+Math.sqrt(4-3*h)));}
