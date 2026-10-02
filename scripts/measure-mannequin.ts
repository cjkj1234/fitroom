// public/models/mannequin.glb를 높이별로 잘라 lib/wardrobe/mannequin-sections.ts(몸 단면 표)를 다시 만든다.
// 실행: node --import tsx scripts/measure-mannequin.ts
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {MORPH_TARGETS,type MorphWeights} from '../lib/wardrobe/body-shape';
import {bandAt,morphedPositions,parseMannequin,sliceAt,torsoAndLeg,type Section} from '../lib/wardrobe/mannequin-mesh';

const root=resolve(import.meta.dirname,'..');
const mesh=parseMannequin(new Uint8Array(readFileSync(resolve(root,'public/models/mannequin.glb'))));
const START=0.04,STEP=0.02,ROWS=86;
// 진동 띠: 1.20~1.48m에서 x≥17cm인 몸 표면(어깨 끝·겨드랑이 앞뒤·위팔 윗부분). 소매 진동 둘레의 앞뒤 깊이를 정한다.
const ARMHOLE_FROM=1.2,ARMHOLE_TO=1.48,ARMHOLE_MIN_X=.17;
type Values=[number,number,number,number,number];
const zero=Object.fromEntries(MORPH_TARGETS.map(name=>[name,0])) as MorphWeights;
const PARTS=['torso','leg','arm','armhole'] as const;
const values=(s:Section|null,part:'torso'|'leg'|'arm'):Values|null=>{
 if(!s)return null;
 const x=part==='torso'?0:(s.maxX+s.minX)/2;
 return [s.perimeter,(s.maxX-s.minX)/2,(s.maxZ-s.minZ)/2,x,(s.maxZ+s.minZ)/2];
};
const measure=(positions:Float32Array)=>Array.from({length:ROWS},(_,i)=>{
 const y=START+i*STEP,{torso,leg,arm}=torsoAndLeg(sliceAt(positions,mesh.indices,y));
 const band=y>=ARMHOLE_FROM-1e-9&&y<=ARMHOLE_TO+1e-9?bandAt(positions,mesh.indices,y,ARMHOLE_MIN_X):null;
 return {torso:values(torso,'torso'),leg:values(leg,'leg'),arm:y>=1.04?values(arm,'arm'):null,armhole:band&&[0,(band.maxX-band.minX)/2,(band.maxZ-band.minZ)/2,(band.maxX+band.minX)/2,(band.maxZ+band.minZ)/2] as Values};
});
const round=(v:number)=>Math.round(v*1e4)/1e4;
const neutral=measure(morphedPositions(mesh,zero,175));
const deltas={plus:{} as Record<string,ReturnType<typeof measure>>,minus:{} as Record<string,ReturnType<typeof measure>>};
for(const name of MORPH_TARGETS){deltas.plus[name]=measure(morphedPositions(mesh,{...zero,[name]:1},175));deltas.minus[name]=measure(morphedPositions(mesh,{...zero,[name]:-1},175));}
const diff=(a:Values|null,b:Values|null):Values|0=>{if(!a||!b)return 0;const d=a.map((v,i)=>round(v-b[i])) as Values;return d.every(v=>Math.abs(v)<1e-4)?0:d;};
const rows=neutral.map((row,i)=>{
 const out:{torso:Values|null;leg:Values|null;arm:Values|null;armhole:Values|null;plus:Record<string,Array<Values|0>>;minus:Record<string,Array<Values|0>>}={torso:row.torso&&row.torso.map(round) as Values,leg:row.leg&&row.leg.map(round) as Values,arm:row.arm&&row.arm.map(round) as Values,armhole:row.armhole&&row.armhole.map(round) as Values,plus:{},minus:{}};
 for(const sign of ['plus','minus'] as const)for(const part of PARTS){
  const list=MORPH_TARGETS.map(name=>diff(deltas[sign][name][i][part],row[part]));
  if(list.some(Boolean))out[sign][part]=list;
 }
 return out;
});
const body=`// 생성 파일: scripts/measure-mannequin.ts가 public/models/mannequin.glb(175cm)를 높이별로 잘라 만든 몸 단면 표. 직접 고치지 않는다.
// 행 i는 높이 SECTION_START + i*SECTION_STEP(m). 값은 [둘레, 반폭, 반깊이, 중심 x, 중심 z](m). torso는 몸통(중앙을 지나는 고리), leg는 오른쪽 다리,
// arm은 오른팔(1.04m 이상, 몸통 옆 가장 안쪽 고리). armhole은 ${ARMHOLE_FROM}~${ARMHOLE_TO}m에서 x≥${ARMHOLE_MIN_X*100}cm인 몸 표면의 범위(둘레 자리는 0).
// plus·minus는 모프 하나를 +1·-1로 줬을 때의 변화량(SECTION_TARGETS 순서, 0은 변화 없음).
type Values=[number,number,number,number,number];
type Deltas={torso?:Array<Values|0>;leg?:Array<Values|0>;arm?:Array<Values|0>;armhole?:Array<Values|0>};
export const SECTION_START=${START};
export const SECTION_STEP=${STEP};
export const SECTION_TARGETS=${JSON.stringify(MORPH_TARGETS)} as const;
export const SECTION_ROWS:Array<{torso:Values|null;leg:Values|null;arm:Values|null;armhole:Values|null;plus:Deltas;minus:Deltas}>=[
${rows.map(r=>' '+JSON.stringify(r)).join(',\n')}
];
`;
writeFileSync(resolve(root,'lib/wardrobe/mannequin-sections.ts'),body);
const check=(y:number)=>neutral[Math.round((y-START)/STEP)];
console.log('중립 단면 둘레(cm): 가슴 1.30',(check(1.30).torso![0]*100).toFixed(1),'허리 1.12',(check(1.12).torso![0]*100).toFixed(1),'엉덩이 0.95',(check(0.95).torso![0]*100).toFixed(1),'머리 1.66',(check(1.66).torso![0]*100).toFixed(1));
console.log('행',rows.length,'몸통 행',rows.filter(r=>r.torso).length,'다리 행',rows.filter(r=>r.leg).length,'팔 행',rows.filter(r=>r.arm).length,'진동 행',rows.filter(r=>r.armhole).length,'파일 크기',body.length);
