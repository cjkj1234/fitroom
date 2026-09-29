import test from 'node:test';
import assert from 'node:assert/strict';
import {SELLER_MEASUREMENT_MAX_CM,describeSellerProductIssue,emptySellerSize,isReservedStoreName,normalizeSellerProductPublication,parseStoredSellerProducts,productReadiness,publishSellerProduct,publishedSellerProducts,reservedStoreNameMessage,sellerProductSchema,unpublishSellerProduct,upsertSellerProduct,type SellerProduct} from './products';

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

test('시연 상점 이름은 공백과 대소문자를 무시하고 예약된다',()=>{
 assert.equal(isReservedStoreName('오후옷장'),true);
 assert.equal(isReservedStoreName(' 오후 옷장 '),true);
 assert.equal(isReservedStoreName('모퉁이상점'),true);
 assert.equal(isReservedStoreName('우리동네옷가게'),false);
 assert.match(reservedStoreNameMessage(' 오후옷장 '),/‘오후옷장’/);
});

test('스키마 오류 경로를 판매자가 이해하는 항목 이름으로 바꾼다',()=>{
 const sizes=[{label:'M'},{label:' L '}];
 assert.equal(describeSellerProductIssue(['sizes',1,'sleeve'],sizes),'L 사이즈의 소매');
 assert.equal(describeSellerProductIssue(['sizes',5,'headCirc'],sizes),'6번째 사이즈의 머리둘레');
 assert.equal(describeSellerProductIssue(['priceKrw'],sizes),'판매가');
 assert.equal(describeSellerProductIssue([],sizes),'입력 내용');
 const tooLong=sellerProductSchema.safeParse({...top,sizes:[{...emptySellerSize('M'),length:SELLER_MEASUREMENT_MAX_CM+1}]});
 assert.equal(tooLong.success,false);
 if(!tooLong.success)assert.equal(describeSellerProductIssue(tooLong.error.issues[0].path,[{label:'M'}]),'M 사이즈의 총장');
});

test('unpublishing and incomplete edits remove a product from the public catalog',()=>{
 const published=publishSellerProduct(top,now)!;
 assert.equal(unpublishSellerProduct(published,'2026-09-21T02:00:00.000Z').status,'draft');
 const invalid=normalizeSellerProductPublication({...published,sizes:[]});
 assert.equal(invalid.status,'draft');
 assert.equal(invalid.publishedAt,null);
});
