import test from 'node:test';
import assert from 'node:assert/strict';
import {sellerProductToWardrobeProduct,sellerStyle} from './catalog';
import {emptySellerSize,sellerProductSchema,type SellerProduct} from './products';

const now='2026-09-29T00:00:00.000Z';
const base:SellerProduct={version:1,id:'p',storeName:'테스트상점',name:'상품',category:'top',color:'카키',features:['기본'],material:null,priceKrw:10000,stock:1,purchaseUrl:null,sizes:[{...emptySellerSize('M'),length:70,chestFlat:55}],createdAt:now,updatedAt:now,status:'published',publishedAt:now};

test('이름과 특징에 적힌 말로 셔츠·카펜터 세부 디자인을 판별한다',()=>{
 assert.equal(sellerStyle({...base,name:'오픈카라 반팔 셔츠'}),'shirt');
 assert.equal(sellerStyle({...base,name:'스트라이프 반팔 티셔츠'}),undefined);
 assert.equal(sellerStyle({...base,name:'데일리 반팔',features:['Oxford shirt 느낌']}),'shirt');
 assert.equal(sellerStyle({...base,name:'베이직 T-shirt'}),undefined);
 assert.equal(sellerStyle({...base,category:'bottom',name:'카펜터 와이드 하프 팬츠'}),'carpenter');
 assert.equal(sellerStyle({...base,category:'bottom',name:'와이드 팬츠',features:['옆 카고 포켓']}),'carpenter');
 assert.equal(sellerStyle({...base,category:'bottom',name:'와이드 슬랙스'}),undefined);
 assert.equal(sellerStyle({...base,category:'hat',name:'셔츠 색 볼캡'}),undefined);
});

test('사진에서 고른 색은 색상 이름보다 우선하고, 없으면 이름으로 정한다',()=>{
 assert.equal(sellerProductToWardrobeProduct({...base,colorHex:'#787260'}).color,'#787260');
 assert.equal(sellerProductToWardrobeProduct(base).color,'#6c6a4b');
 const converted=sellerProductToWardrobeProduct({...base,name:'오픈카라 반팔 셔츠'});
 assert.equal(converted.style,'shirt');
 assert.equal(converted.colorName,'카키');
});

test('표시 색상은 #rrggbb 형식만 저장하고 없어도 기존 데이터가 그대로 읽힌다',()=>{
 assert.equal(sellerProductSchema.safeParse({...base,colorHex:'#736249'}).success,true);
 assert.equal(sellerProductSchema.safeParse({...base,colorHex:null}).success,true);
 assert.equal(sellerProductSchema.safeParse(base).success,true);
 assert.equal(sellerProductSchema.safeParse({...base,colorHex:'olive'}).success,false);
 assert.equal(sellerProductSchema.safeParse({...base,colorHex:'#12345'}).success,false);
});
