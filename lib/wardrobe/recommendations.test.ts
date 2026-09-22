import test from 'node:test';
import assert from 'node:assert/strict';
import {PRODUCTS} from './catalog';
import {createWardrobeCollection} from './collection';
import {recommendWardrobeProducts} from './recommendations';

test('recommendations stay empty without favorites or saved looks',()=>{
 assert.deepEqual(recommendWardrobeProducts(PRODUCTS,createWardrobeCollection()),[]);
});

test('favorites recommend related products and exclude already collected items',()=>{
 const favorite=PRODUCTS.find(product=>product.brand==='오후옷장'&&product.slot==='top')!;
 const collection={...createWardrobeCollection(),favoriteProductIds:[favorite.id]};
 const recommendations=recommendWardrobeProducts(PRODUCTS,collection,4);
 assert.ok(recommendations.length>0);
 assert.equal(recommendations.some(item=>item.productId===favorite.id),false);
 assert.equal(PRODUCTS.find(product=>product.id===recommendations[0].productId)?.brand,'오후옷장');
 assert.ok(recommendations[0].reasons.some(reason=>reason.includes('찜한 취향')));
});

test('saved looks contribute signals while missing product ids are ignored',()=>{
 const top=PRODUCTS.find(product=>product.slot==='top')!;
 const collection={...createWardrobeCollection(),favoriteProductIds:['missing'],looks:[{id:'look',name:'코디 1',savedAt:'2026-09-22T00:00:00.000Z',outfit:{top:{productId:top.id,size:top.defaultSize},bottom:{productId:'missing',size:'M'}}}]};
 const recommendations=recommendWardrobeProducts(PRODUCTS,collection,3);
 assert.equal(recommendations.some(item=>item.productId===top.id),false);
 assert.ok(recommendations.some(item=>item.reasons.some(reason=>reason.includes('저장 코디'))));
});
