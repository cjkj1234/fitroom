import test from 'node:test';
import assert from 'node:assert/strict';
import {AdGenerationError,generateAdDrafts} from './openai';
import type {AdRequest,AdResponse} from './contracts';

const request:AdRequest={version:1,storeName:'오후옷장',product:{name:'스트라이프 반팔 티셔츠',category:'top',color:'화이트·네이비',features:['가로 스트라이프'],material:null,priceKrw:29000,discountPercent:null},campaign:{channel:'instagram_post',audience:'20대',tone:'friendly',purpose:'product_intro',cta:'view_product',additionalRequest:null}};
const result:AdResponse={drafts:[
 {angle:'product_facts',headline:'스트라이프를 소개해요',body:'화이트·네이비 가로 스트라이프 반팔 티셔츠를 소개합니다.',cta:'상품을 확인해 보세요.',hashtags:['오후옷장','스트라이프','반팔티']},
 {angle:'styling',headline:'데님과 매치해 보세요',body:'화이트·네이비 스트라이프 티셔츠를 데님과 함께 매치해 보세요.',cta:'코디를 살펴보세요.',hashtags:['데일리룩','캐주얼코디','스트라이프티']},
 {angle:'daily_scene',headline:'주말 코디에 한 줄',body:'주말 외출 코디에 스트라이프 반팔 티셔츠를 활용해 보세요.',cta:'오후옷장에서 만나보세요.',hashtags:['주말코디','오후옷장','라운드넥']},
]};

test('generation sends server-only structured request and validates output',async()=>{
 let captured:RequestInit|undefined;
 const fetcher=async(_input:string|URL|Request,init?:RequestInit)=>{captured=init;return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]}),{status:200,headers:{'Content-Type':'application/json'}});};
 const generated=await generateAdDrafts(request,'test-key',fetcher);
 assert.equal(generated.drafts.length,3);
 const body=JSON.parse(String(captured?.body));
 assert.equal(body.model,'gpt-5-mini');assert.equal(body.store,false);assert.equal(body.text.format.strict,true);
 assert.equal(String(body.input).includes('image'),false);
 assert.equal((captured?.headers as Record<string,string>).Authorization,'Bearer test-key');
});

test('provider rate limit becomes a safe application error',async()=>{
 const fetcher=async()=>new Response('{}',{status:429});
 await assert.rejects(()=>generateAdDrafts(request,'test-key',fetcher),error=>error instanceof AdGenerationError&&error.code==='rate_limited'&&error.status===429);
});

test('archived or unauthorized API projects get an actionable safe error',async()=>{
 const fetcher=async()=>new Response(JSON.stringify({error:{message:'provider detail'}}),{status:401});
 await assert.rejects(()=>generateAdDrafts(request,'test-key',fetcher),error=>error instanceof AdGenerationError&&error.code==='authentication_failed'&&error.status===503&&error.message.includes('활성 프로젝트'));
});

test('malformed provider JSON is reported as an invalid response',async()=>{
 const fetcher=async()=>new Response('not-json',{status:200,headers:{'Content-Type':'application/json'}});
 await assert.rejects(()=>generateAdDrafts(request,'test-key',fetcher),error=>error instanceof AdGenerationError&&error.code==='invalid_response');
});
