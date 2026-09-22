import test from 'node:test';
import assert from 'node:assert/strict';
import {AD_MODEL,AD_PROMPT_VERSION,type AdDraft,type AdRequest} from './contracts';
import {createAdEvaluationLog,createAdEvaluationRecord,parseStoredAdEvaluations,reviewAverage,saveAdEvaluation} from './evaluations';

const request:AdRequest={version:1,storeName:'오후옷장',product:{name:'린넨 셔츠',category:'top',color:'네이비',features:['포켓'],material:null,priceKrw:45000,discountPercent:null},campaign:{channel:'instagram_post',audience:'일상복을 찾는 고객',tone:'friendly',purpose:'product_intro',cta:'view_product',additionalRequest:null}};
const drafts:AdDraft[]=[
 {angle:'product_facts',headline:'포켓이 있는 셔츠',body:'네이비 린넨 셔츠를 소개합니다.',cta:'상품을 확인해 보세요.',hashtags:['린넨셔츠','네이비','오후옷장']},
 {angle:'styling',headline:'매일 입는 네이비',body:'일상 코디에 매치해 보세요.',cta:'코디를 확인해 보세요.',hashtags:['데일리룩','셔츠코디','네이비']},
 {angle:'daily_scene',headline:'가벼운 하루의 셔츠',body:'주말 외출에 활용해 보세요.',cta:'상품을 만나보세요.',hashtags:['주말코디','린넨','셔츠']},
];

test('evaluation storage rejects malformed records',()=>{
 assert.deepEqual(parseStoredAdEvaluations('{broken'),createAdEvaluationLog());
 assert.deepEqual(parseStoredAdEvaluations(JSON.stringify({version:1,records:[{id:'bad'}]})),createAdEvaluationLog());
});

test('manual scores create reproducible model evidence',()=>{
 const review={factPreservation:5,toneMatch:4,usefulness:4,notes:'과장 표현 없음'};
 const record=createAdEvaluationRecord({request,drafts,model:AD_MODEL,promptVersion:AD_PROMPT_VERSION,durationMs:840},review,'evaluation-1','2026-09-22T02:00:00.000Z');
 assert.ok(record);
 assert.equal(record.request.product.name,'린넨 셔츠');
 assert.equal(record.drafts.length,3);
 assert.equal(reviewAverage(review),4.3);
});

test('saving an evaluation updates duplicates and keeps the newest 50',()=>{
 let log=createAdEvaluationLog();
 for(let index=0;index<52;index++){
  const record=createAdEvaluationRecord({request,drafts,model:AD_MODEL,promptVersion:AD_PROMPT_VERSION,durationMs:index},{factPreservation:3,toneMatch:3,usefulness:3,notes:''},`evaluation-${index}`,new Date(Date.UTC(2026,8,22,0,0,index)).toISOString())!;
  log=saveAdEvaluation(log,record);
 }
 assert.equal(log.records.length,50);
 assert.equal(log.records[0].id,'evaluation-51');
 assert.equal(log.records.at(-1)?.id,'evaluation-2');
});
