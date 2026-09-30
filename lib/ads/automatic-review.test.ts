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

const withCampaign=(campaign:Partial<AdRequest['campaign']>):AdRequest=>({...request,campaign:{...request.campaign,...campaign}});
const draftWith=(index:number,change:Partial<AdDraft>)=>drafts.map((draft,position)=>position===index?{...draft,...change}:draft);

test('a copied seller request is reported, but wording that comes from the product is not',()=>{
 const asked=withCampaign({additionalRequest:'과장 없이 짧고 친근하게 써 주세요.'});
 const echoed=automaticReview(asked,draftWith(2,{body:'주말에 활용해 보세요. 과장 없이 짧게 안내드립니다.'}));
 assert.ok(echoed.styleReview.requestEchoCandidates.some(run=>run.includes('과장없이')));
 assert.equal(echoed.needsStyleReview,true);
 const fromProduct=automaticReview(withCampaign({additionalRequest:'스트라이프 느낌으로 써 주세요.'}),draftWith(1,{body:'스트라이프 티셔츠를 데님과 매치해 보세요.'}));
 assert.deepEqual(fromProduct.styleReview.requestEchoCandidates,[]);
});

test('a new-arrival campaign reports drafts that never say the product is new',()=>{
 const arrival=withCampaign({purpose:'new_arrival'});
 assert.deepEqual(automaticReview(arrival,drafts).styleReview.purposeMissingDrafts,[1,2,3]);
 assert.deepEqual(automaticReview(arrival,draftWith(1,{headline:'신상 코디 제안'})).styleReview.purposeMissingDrafts,[1,3]);
 assert.deepEqual(automaticReview(withCampaign({purpose:'product_intro'}),drafts).styleReview.purposeMissingDrafts,[]);
});

test('sentences and closing lines repeated between drafts are reported',()=>{
 const same='화이트 가로 스트라이프 반팔 티셔츠입니다';
 const result=automaticReview(request,drafts.map((draft,index)=>({...draft,body:`${same}. ${draft.body}`,cta:index===1?'코디 보기':'상품 보기'})));
 assert.deepEqual(result.styleReview.repeatedSentences,[same]);
 assert.deepEqual(result.styleReview.repeatedCtas,['상품 보기']);
 assert.equal(automaticReview(request,drafts.map((draft,index)=>({...draft,cta:`안내 ${index}번 문구`}))).styleReview.repeatedCtas.length,0);
});
