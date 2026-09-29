import test from 'node:test';
import assert from 'node:assert/strict';
import {adRequestSchema,adResponseSchema,extractOpenAIText,firstValidationMessage,normalizeAdResponseCandidate} from './contracts';

const request={
 version:1 as const,storeName:'오후옷장',
 product:{name:'스트라이프 반팔 티셔츠',category:'top' as const,color:'화이트·네이비',features:['가로 스트라이프','라운드넥'],material:null,priceKrw:29000,discountPercent:null},
 campaign:{channel:'instagram_post' as const,audience:'일상 캐주얼 코디를 찾는 20~30대',tone:'friendly' as const,purpose:'product_intro' as const,cta:'view_product' as const,additionalRequest:null},
};
const drafts=[
 {angle:'product_facts' as const,headline:'스트라이프로 완성한 오늘',body:'화이트·네이비 가로 스트라이프와 라운드넥을 담은 반팔 티셔츠예요.',cta:'상품 정보를 확인해 보세요.',hashtags:['오후옷장','스트라이프티','반팔티']},
 {angle:'styling' as const,headline:'데님과 가볍게 매치해요',body:'화이트·네이비 스트라이프 반팔을 가지고 있는 데님과 함께 매치해 보세요.',cta:'코디할 상품을 살펴보세요.',hashtags:['캐주얼코디','데일리룩','스트라이프']},
 {angle:'daily_scene' as const,headline:'주말 외출에 더하는 줄무늬',body:'주말 외출 코디에 라운드넥 스트라이프 반팔을 활용해 보세요.',cta:'오후옷장에서 만나보세요.',hashtags:['주말코디','오후옷장','라운드넥']},
];

test('valid ad request is accepted',()=>{assert.equal(adRequestSchema.safeParse(request).success,true);});
test('promotion requires a confirmed discount percentage',()=>{const result=adRequestSchema.safeParse({...request,product:{...request.product,discountPercent:null},campaign:{...request.campaign,purpose:'promotion'}});assert.equal(result.success,false);});
test('invalid price uses a seller-friendly validation message',()=>{const result=adRequestSchema.safeParse({...request,product:{...request.product,priceKrw:Number.NaN}});assert.equal(result.success,false);if(!result.success)assert.equal(firstValidationMessage(result.error),'판매가는 숫자로 입력해 주세요.');});
test('response requires three unique angles and headlines',()=>{assert.equal(adResponseSchema.safeParse({drafts}).success,true);assert.equal(adResponseSchema.safeParse({drafts:[drafts[0],{...drafts[1],angle:'product_facts'},drafts[2]]}).success,false);});
test('response text is extracted from the Responses API output',()=>{assert.equal(extractOpenAIText({output:[{type:'message',content:[{type:'output_text',text:'{"drafts":[]}'}]}]}),'{"drafts":[]}');assert.equal(extractOpenAIText({output:[]}),null);});
test('model hashtag markers and spaces are normalized before validation',()=>{
 const candidate={drafts:drafts.map(draft=>({...draft,hashtags:draft.hashtags.map(tag=>` #${tag}! `)}))};
 const normalized=normalizeAdResponseCandidate(candidate);
 const parsed=adResponseSchema.parse(normalized);
 assert.deepEqual(parsed.drafts[0].hashtags,['오후옷장','스트라이프티','반팔티']);
});
