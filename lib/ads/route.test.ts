import test from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../../app/api/ads/generate/route';

const validRequest={version:1,storeName:'오후옷장',product:{name:'스트라이프 반팔 티셔츠',category:'top',color:'화이트·네이비',features:['가로 스트라이프'],material:null,priceKrw:29000,discountPercent:null},campaign:{channel:'instagram_post',audience:'20대',tone:'friendly',purpose:'product_intro',cta:'view_product',additionalRequest:null}};
const call=(body:string)=>POST(new Request('http://localhost/api/ads/generate',{method:'POST',headers:{'Content-Type':'application/json'},body}));

test('route rejects oversized input before model configuration',async()=>{
 const response=await call(JSON.stringify({padding:'가'.repeat(40_000)}));
 assert.equal(response.status,413);
 const payload=await response.json() as {error:{code:string}};
 assert.equal(payload.error.code,'request_too_large');
 assert.ok(response.headers.get('x-request-id'));
});

test('route returns safe validation and configuration errors without logging product data',async()=>{
 const previous=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
 const messages:string[]=[];const original=console.info;console.info=(message?:unknown)=>messages.push(String(message));
 try{
  const invalid=await call('{bad json');assert.equal(invalid.status,400);
  const missingKey=await call(JSON.stringify(validRequest));assert.equal(missingKey.status,503);
  const payload=await missingKey.json() as {error:{code:string}};
  assert.equal(payload.error.code,'configuration_missing');
 }finally{console.info=original;if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous;}
 assert.equal(messages.some(message=>message.includes('오후옷장')||message.includes('스트라이프')),false);
 assert.equal(messages.every(message=>message.includes('requestId')&&message.includes('durationMs')),true);
});
