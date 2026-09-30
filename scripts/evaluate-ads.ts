import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {adRequestSchema} from '../lib/ads/contracts';
import {automaticReview} from '../lib/ads/automatic-review';
import {AdGenerationError,generateAdDrafts} from '../lib/ads/openai';

type EvaluationCase={id:string;description:string;expectedValid:boolean;request:unknown};
type EvaluationFile={cases:EvaluationCase[]};
const dryRun=process.argv.includes('--dry-run');
const root=resolve(import.meta.dirname,'..');
const source=JSON.parse(await readFile(resolve(root,'docs/ads/evaluation-cases.json'),'utf8')) as EvaluationFile;
const validCases=source.cases.filter(item=>item.expectedValid).map(item=>{const parsed=adRequestSchema.safeParse(item.request);if(!parsed.success)throw new Error(`${item.id}: 평가 입력이 현재 요청 규격과 맞지 않습니다.`);return {...item,request:parsed.data};});
const invalidChecks=source.cases.filter(item=>!item.expectedValid).map(item=>({id:item.id,rejected:!adRequestSchema.safeParse(item.request).success}));
type Generated=Awaited<ReturnType<typeof generateAdDrafts>>;
type EvaluationResult={id:string;description:string;model:string;promptVersion:string;durationMs:number;request:(typeof validCases)[number]['request'];drafts:Generated['drafts'];automaticReview:ReturnType<typeof automaticReview>;manualReview:{factPreservation:null;toneMatch:null;usefulness:null;notes:string}};

if(dryRun){
 const rejected=invalidChecks.filter(item=>item.rejected).length;
 console.log(`평가 준비 완료: 실제 생성 ${validCases.length}건, 입력 거부 ${rejected}/${invalidChecks.length}건`);
 process.exit(rejected===invalidChecks.length?0:1);
}

const apiKey=process.env.OPENAI_API_KEY;
if(!apiKey)throw new Error('OPENAI_API_KEY가 없습니다. 키를 파일에 저장하지 말고 실행 환경의 비밀값으로 설정해 주세요.');

function styleSummary(review:EvaluationResult['automaticReview']['styleReview']){
 const parts=[
  review.requestEchoCandidates.length?`요청 문장 인용 의심(${review.requestEchoCandidates.join(', ')})`:'',
  review.purposeMissingDrafts.length?`목적 표현 없음(초안 ${review.purposeMissingDrafts.join(', ')})`:'',
  review.repeatedSentences.length?`초안 간 반복 문장 ${review.repeatedSentences.length}건`:'',
  review.repeatedCtas.length?`같은 마지막 안내 ${review.repeatedCtas.length}건`:'',
  review.aiPatternCandidates.length?`AI 문투 후보(${review.aiPatternCandidates.join(', ')})`:'',
  review.repeatedOpenings.length?`같은 시작 ${review.repeatedOpenings.length}건`:'',
  review.disclosureCandidates.length?`입력 없음을 언급(${review.disclosureCandidates.join(', ')})`:'',
 ].filter(Boolean);
 return parts.join('; ')||'-';
}

function markdown(results:EvaluationResult[],createdAt:string,failures:{id:string;code:string;elapsedMs:number}[]){
 const failureLines=failures.length?`\n## 생성 실패\n\n${failures.map(item=>`- ${item.id}: ${item.code} (${item.elapsedMs}ms)`).join('\n')}\n`:'';
 const rows=results.map(result=>`| ${result.id} | ${result.durationMs}ms | ${result.automaticReview.productSignalCount} | ${[...result.automaticReview.unsupportedClaimCandidates,...result.automaticReview.causalClaimCandidates].join(', ')||'-'} | ${result.automaticReview.unsupportedNumberCandidates.join(', ')||'-'} | ${styleSummary(result.automaticReview.styleReview)} | 미평가 |`).join('\n');
 return `# 광고 문구 모델 평가\n\n실행 시각: ${createdAt}  \n모델: ${results[0]?.model??'-'}  \n프롬프트: ${results[0]?.promptVersion??'-'}\n\n자동 검사는 결과 형식과 의심 표현을 찾는 보조 절차입니다. 사실 보존·말투·활용 가능성은 사람이 원문과 대조해 최종 평가해야 합니다.\n\n| 입력 | 시간 | 상품 정보 신호 | 의심 성능 표현 | 의심 숫자 | 문체·구성 검토 후보 | 사람 평가 |\n| --- | ---: | ---: | --- | --- | --- | --- |\n${rows}\n\n## 사람 평가 기준\n\n각 결과를 입력과 대조해 사실 보존, 요청한 말투 반영, 소상공인이 수정해 쓸 수 있는 정도를 1–5점으로 기록합니다. 자동 검사 통과를 사실 검증 완료로 간주하지 않습니다.\n${failureLines}`;
}

const results:EvaluationResult[]=[];
const failures:{id:string;code:string;elapsedMs:number;details:{path:string;code:string;message:string}[]}[]=[];
for(const item of validCases){
 const startedAt=Date.now();
 let generated;
 try{generated=await generateAdDrafts(item.request,apiKey);}
 catch(error){
  // 한 건이 실패해도 나머지를 계속 실행하고, 실패도 결과 파일에 남긴다(실패를 숨기지 않는다).
  const code=error instanceof AdGenerationError?error.code:'unknown';
  failures.push({id:item.id,code,elapsedMs:Date.now()-startedAt,details:error instanceof AdGenerationError?error.details:[]});
  console.error(`${item.id}: 실패(${code}) ${Date.now()-startedAt}ms`);
  continue;
 }
 results.push({id:item.id,description:item.description,model:generated.meta.model,promptVersion:generated.meta.promptVersion,durationMs:generated.meta.durationMs,request:item.request,drafts:generated.drafts,automaticReview:automaticReview(item.request,generated.drafts),manualReview:{factPreservation:null,toneMatch:null,usefulness:null,notes:''}});
 console.log(`${item.id}: ${generated.meta.durationMs}ms`);
}
const createdAt=new Date().toISOString();
const stamp=createdAt.replace(/[:.]/g,'-');
const directory=resolve(root,'docs/evaluations/runs');
await mkdir(directory,{recursive:true});
await writeFile(resolve(directory,`${stamp}.json`),JSON.stringify({createdAt,invalidInputChecks:invalidChecks,generationFailures:failures,results},null,2));
await writeFile(resolve(directory,`${stamp}.md`),markdown(results,createdAt,failures));
console.log(`평가 결과 저장: docs/evaluations/runs/${stamp}.{json,md}`);
