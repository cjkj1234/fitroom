import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySellerSize,normalizeSellerProductPublication,parseStoredSellerProducts,productReadiness,publishSellerProduct,publishedSellerProducts,sellerProductSchema,unpublishSellerProduct,upsertSellerProduct,type SellerProduct} from './products';

const now='2026-09-21T00:00:00.000Z';
const top:SellerProduct={version:1,id:'p1',storeName:'오후옷장',name:'스트라이프 반팔',category:'top',color:'네이비',features:['스트라이프'],material:null,priceKrw:29000,stock:3,purchaseUrl:null,sizes:[{...emptySellerSize('M'),length:70,chestFlat:56}],createdAt:now,updatedAt:now,status:'draft',publishedAt:null};

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

test('legacy saved products migrate to a draft publication state',()=>{
 const {status:_,publishedAt:__,purchaseUrl:___,...legacy}=top;
 const [parsed]=parseStoredSellerProducts(JSON.stringify([legacy]));
 assert.equal(parsed.status,'draft');
 assert.equal(parsed.publishedAt,null);
 assert.equal(parsed.purchaseUrl,null);
});

test('upsert keeps the newest product first without duplicates',()=>{
 const other={...top,id:'p2',name:'와이드 팬츠'};
 const changed={...top,name:'수정된 반팔'};
 assert.deepEqual(upsertSellerProduct([other,top],changed).map(item=>item.name),['수정된 반팔','와이드 팬츠']);
});

test('only complete products can be published and exposed to shoppers',()=>{
 const published=publishSellerProduct(top,'2026-09-21T01:00:00.000Z');
 assert.ok(published);
 assert.equal(published.status,'published');
 assert.equal(published.publishedAt,'2026-09-21T01:00:00.000Z');
 assert.deepEqual(publishedSellerProducts([top,published]),[published]);
 assert.equal(publishSellerProduct({...top,priceKrw:null},now),null);
});

test('published products and small-shop purchase links survive a storage round trip',()=>{
 const published=publishSellerProduct({...top,purchaseUrl:'https://example.com/products/p1'},'2026-09-21T01:00:00.000Z')!;
 assert.deepEqual(parseStoredSellerProducts(JSON.stringify([published])),[published]);
});

test('unpublishing and incomplete edits remove a product from the public catalog',()=>{
 const published=publishSellerProduct(top,now)!;
 assert.equal(unpublishSellerProduct(published,'2026-09-21T02:00:00.000Z').status,'draft');
 const invalid=normalizeSellerProductPublication({...published,sizes:[]});
 assert.equal(invalid.status,'draft');
 assert.equal(invalid.publishedAt,null);
});
