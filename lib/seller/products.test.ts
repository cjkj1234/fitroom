import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySellerSize,parseStoredSellerProducts,productReadiness,sellerProductSchema,upsertSellerProduct,type SellerProduct} from './products';

const now='2026-09-21T00:00:00.000Z';
const top:SellerProduct={version:1,id:'p1',storeName:'오후옷장',name:'스트라이프 반팔',category:'top',color:'네이비',features:['스트라이프'],material:null,priceKrw:29000,stock:3,sizes:[{...emptySellerSize('M'),length:70,chestFlat:56}],createdAt:now,updatedAt:now};

test('seller products require category-specific measurements before catalog readiness',()=>{
 assert.deepEqual(productReadiness(top),{ready:true,percent:100,missing:[]});
 const incomplete={...top,sizes:[{...top.sizes[0],chestFlat:null}],stock:null};
 assert.deepEqual(productReadiness(incomplete),{ready:false,percent:50,missing:['재고','필수 실측']});
 assert.deepEqual(productReadiness({...top,priceKrw:null,stock:null,sizes:[]}),{ready:false,percent:0,missing:['판매가','재고','사이즈','필수 실측']});
});

test('stored seller products ignore corrupt and unexpected records',()=>{
 const result=parseStoredSellerProducts(JSON.stringify([top,{...top,id:'extra',secret:'remove'},{name:'broken'}]));
 assert.deepEqual(result,[top]);
 assert.equal(sellerProductSchema.safeParse(top).success,true);
});

test('upsert keeps the newest product first without duplicates',()=>{
 const other={...top,id:'p2',name:'와이드 팬츠'};
 const changed={...top,name:'수정된 반팔'};
 assert.deepEqual(upsertSellerProduct([other,top],changed).map(item=>item.name),['수정된 반팔','와이드 팬츠']);
});
