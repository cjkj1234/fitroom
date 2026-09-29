import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticReview} from './automatic-review';
import type {AdDraft,AdRequest} from './contracts';

const request:AdRequest={version:1,storeName:'오후옷장',product:{name:'스트라이프 티셔츠',category:'top',color:'화이트',features:['반팔'],material:null,priceKrw:29000,discountPercent:10},campaign:{channel:'instagram_post',audience:'20~30대',tone:'friendly',purpose:'promotion',cta:'view_product',additionalRequest:null}};
const drafts:AdDraft[]=[
 {angle:'product_facts',headline:'29,000원 상품',body:'화이트 반팔을 10% 할인합니다.',cta:'상품 보기',hashtags:['스트라이프티','반팔','오후옷장']},
 {angle:'styling',headline:'코디 제안',body:'데님과 매치해 보세요.',cta:'코디 보기',hashtags:['데일리룩','데님코디','화이트']},
 {angle:'daily_scene',headline:'주말 제안',body:'주말에 활용해 보세요.',cta:'상품 보기',hashtags:['주말룩','반팔티','오후옷장']},
];

test('formatted source prices and percentages are not reported as unsupported numbers',()=>{
 const result=automaticReview(request,drafts);
 assert.deepEqual(result.unsupportedNumberCandidates,[]);
 assert.equal(result.needsManualReview,false);
});

test('unprovided performance and number claims are reported for review',()=>{
 const changed=drafts.map((draft,index)=>index===0?{...draft,body:`${draft.body} 무료 배송과 50% 할인을 제공합니다.`}:draft);
 const result=automaticReview(request,changed);
 assert.deepEqual(result.unsupportedClaimCandidates,['무료 배송']);
 assert.deepEqual(result.unsupportedNumberCandidates,['50%']);
 assert.equal(result.needsManualReview,true);
});
