import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySellerSize,type SellerProduct} from './products';
import {publishedSellerCatalog,sellerColorToHex,sellerProductToWardrobeProduct} from './catalog';

const product:SellerProduct={version:1,id:'shop-1',storeName:'오후옷장',name:'데일리 와이드 팬츠',category:'bottom',color:'네이비',features:['허리 밴딩','와이드'],material:'면',priceKrw:39000,stock:4,purchaseUrl:'https://example.com/products/shop-1',sizes:[{...emptySellerSize('M'),length:103,waistFlat:36,hipsFlat:52}],createdAt:'2026-09-21T00:00:00.000Z',updatedAt:'2026-09-21T01:00:00.000Z',status:'published',publishedAt:'2026-09-21T01:00:00.000Z'};

test('seller product becomes a wearable catalog product without null measurements',()=>{
 const converted=sellerProductToWardrobeProduct(product);
 assert.equal(converted.id,'seller:shop-1');
 assert.equal(converted.source,'seller');
 assert.equal(converted.slot,'bottom');
 assert.equal(converted.silhouette,'wide');
 assert.equal(converted.elasticWaist,true);
 assert.equal(converted.color,'#273347');
 assert.equal(converted.url,'https://example.com/products/shop-1');
 assert.deepEqual(converted.sizes,[{label:'M',length:103,waistFlat:36,hipsFlat:52}]);
});

test('only ready, published seller products enter the shopper catalog',()=>{
 assert.equal(publishedSellerCatalog([product]).length,1);
 assert.equal(publishedSellerCatalog([{...product,status:'draft'}]).length,0);
 assert.equal(publishedSellerCatalog([{...product,sizes:[]}]).length,0);
});

test('free-form color names always resolve to a stable render color',()=>{
 assert.equal(sellerColorToHex('#123abc'),'#123abc');
 assert.equal(sellerColorToHex('오묘한 밤색'),sellerColorToHex('오묘한 밤색'));
 assert.match(sellerColorToHex('오묘한 밤색'),/^#[0-9a-f]{6}$/i);
});
