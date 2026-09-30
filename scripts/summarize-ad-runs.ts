import {readdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {automaticReview} from '../lib/ads/automatic-review';
import type {AdDraft,AdRequest} from '../lib/ads/contracts';

// docs/evaluations/runs 와 runs/repeats 의 실제 모델 실행 결과를 프롬프트 버전별로 묶어 현재의 자동 검사로 다시 집계한다.
type Run={results:{id:string;promptVersion:string;durationMs:number;request:AdRequest;drafts:AdDraft[]}[]};
const root=resolve(import.meta.dirname,'..','docs/evaluations/runs');
const files=[...(await readdir(root)).filter(name=>name.endsWith('.json')).map(name=>resolve(root,name)),...(await readdir(resolve(root,'repeats'))).filter(name=>name.endsWith('.json')).map(name=>resolve(root,'repeats',name))];
const evaluativeWord=/기본 아이템|깔끔|무난|실용적|추천|편안|편하게|세련|스타일리시|트렌디/;
const groups=new Map<string,{runs:number;cases:number;ms:number[];claims:number;causal:number;disclosure:number;aiCases:number;aiWords:number;openings:number;repeats:number;purpose:number;echo:number;evaluative:number;drafts:number}>();
for(const file of files){
 const run=JSON.parse(await readFile(file,'utf8')) as Run;
 const version=run.results[0]?.promptVersion;
 if(!version)continue;
 const group=groups.get(version)??{runs:0,cases:0,ms:[],claims:0,causal:0,disclosure:0,aiCases:0,aiWords:0,openings:0,repeats:0,purpose:0,echo:0,evaluative:0,drafts:0};
 group.runs++;
 for(const item of run.results){
  const review=automaticReview(item.request,item.drafts),style=review.styleReview;
  group.cases++;group.ms.push(item.durationMs);
  if(review.unsupportedClaimCandidates.length)group.claims++;
  if(review.causalClaimCandidates.length)group.causal++;
  if(style.disclosureCandidates.length)group.disclosure++;
  if(style.aiPatternCandidates.length){group.aiCases++;group.aiWords+=style.aiPatternCandidates.length;}
  if(style.repeatedOpenings.length)group.openings++;
  if(style.repeatedSentences.length||style.repeatedCtas.length)group.repeats++;
  if(style.purposeMissingDrafts.length)group.purpose++;
  if(style.requestEchoCandidates.length)group.echo++;
  for(const draft of item.drafts){group.drafts++;if(evaluativeWord.test(`${draft.headline} ${draft.body}`))group.evaluative++;}
 }
 groups.set(version,group);
}
const versions=[...groups.keys()].sort();
const cell=(pick:(group:NonNullable<ReturnType<typeof groups.get>>)=>string)=>versions.map(version=>pick(groups.get(version)!)).join(' | ');
const average=(values:number[])=>(values.reduce((sum,value)=>sum+value,0)/values.length/1000).toFixed(1);
console.log(`| 항목 | ${versions.join(' | ')} |\n| --- | ${versions.map(()=>'---').join(' | ')} |`);
console.log(`| 실행 횟수(입력 건수) | ${cell(group=>`${group.runs}회(${group.cases}건)`)} |`);
console.log(`| 평균 응답 시간 | ${cell(group=>`${average(group.ms)}초`)} |`);
console.log(`| 요청 문장 인용 | ${cell(group=>`${group.echo}/${group.cases}`)} |`);
console.log(`| 신상·할인 목적 표현 누락 | ${cell(group=>`${group.purpose}/${group.cases}`)} |`);
console.log(`| 반복 문장·같은 마지막 안내 | ${cell(group=>`${group.repeats}/${group.cases}`)} |`);
console.log(`| 같은 시작 | ${cell(group=>`${group.openings}/${group.cases}`)} |`);
console.log(`| 입력 없음 언급 | ${cell(group=>`${group.disclosure}/${group.cases}`)} |`);
console.log(`| 정가·착용 효과 의심 표현 | ${cell(group=>`${group.claims}/${group.cases}`)} |`);
console.log(`| 소재를 이유로 한 효과 | ${cell(group=>`${group.causal}/${group.cases}`)} |`);
console.log(`| AI 문투 후보(건 / 단어 수) | ${cell(group=>`${group.aiCases}/${group.cases} / ${group.aiWords}`)} |`);
console.log(`| 평가어가 든 초안 | ${cell(group=>`${group.evaluative}/${group.drafts}`)} |`);
