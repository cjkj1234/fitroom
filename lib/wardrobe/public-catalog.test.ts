import assert from 'node:assert/strict';
import test from 'node:test';
import {buildPublicSellerStores,mergePublicSellerProducts,mergePublicSellerStores,parsePublicSellerCatalogResponse} from './public-catalog';
import {emptySellerSize,type SellerProduct} from '../seller/products';
import {createDefaultSellerStore,type SellerStoreProfile} from '../seller/store';
import type {SellerWorkspaceRow} from '../seller/workspace';

const now='2026-09-25T08:00:00.000Z';

function product(overrides:Partial<SellerProduct>={}):SellerProduct{
 return {version:1,id:'product-1',storeName:'서버마켓',name:'데일리 티셔츠',category:'top',color:'네이비',features:['베이직'],material:'면',priceKrw:29000,stock:8,purchaseUrl:'https://example.com/product-1',sizes:[{...emptySellerSize('M'),length:68,chestFlat:54}],createdAt:now,updatedAt:now,status:'published',publishedAt:now,...overrides};
}

function store(overrides:Partial<SellerStoreProfile>={}):SellerStoreProfile{
 return {...createDefaultSellerStore('서버마켓',now),tagline:'동네 상점의 좋은 옷',placements:[{productId:'product-1',zone:'center-rack'}],previewConfirmed:true,status:'published',publishedAt:now,...overrides};
}

function row(products:SellerProduct[],profile:SellerStoreProfile|null,updatedAt=now):SellerWorkspaceRow{
 return {productsJson:JSON.stringify(products),storeJson:profile?JSON.stringify(profile):null,updatedAt};
}

test('게시와 매장 준비 검증을 통과한 상품만 공개한다',()=>{
 const draft=product({id:'draft-product',name:'비공개 상품',status:'draft',publishedAt:null});
 const result=buildPublicSellerStores([row([product(),draft],store({placements:[{productId:'product-1',zone:'center-rack'},{productId:'draft-product',zone:'left-wall'}]}))]);
 assert.equal(result.length,1);
 assert.deepEqual(result[0].products.map(item=>item.id),['product-1']);
 assert.deepEqual(result[0].store.placements,[{productId:'product-1',zone:'center-rack'}]);
 assert.equal(JSON.stringify(result).includes('draft-product'),false);
});

test('초안 매장과 배치가 깨진 매장은 공개하지 않는다',()=>{
 const draftStore=store({status:'draft',publishedAt:null});
 const brokenStore=store({storeName:'다른매장',placements:[{productId:'missing',zone:'left-wall'}]});
 assert.deepEqual(buildPublicSellerStores([row([product()],draftStore),row([product({storeName:'다른매장'})],brokenStore)]),[]);
});

test('시연 상점과 같은 이름으로 게시된 매장은 공개하지 않는다',()=>{
 const demoNamed=store({storeName:'오후옷장'});
 assert.deepEqual(buildPublicSellerStores([row([product({storeName:'오후옷장'})],demoNamed)]),[]);
 assert.equal(buildPublicSellerStores([row([product()],store())]).length,1);
});

test('같은 이름의 매장은 최신 행 하나만 사용한다',()=>{
 const latest=store({tagline:'최신 소개'}),older=store({tagline:'이전 소개'});
 const result=buildPublicSellerStores([row([product()],latest,'2026-09-25T09:00:00.000Z'),row([product()],older,'2026-09-24T09:00:00.000Z')]);
 assert.equal(result.length,1);
 assert.equal(result[0].store.tagline,'최신 소개');
});

test('공개 응답은 엄격히 검증하고 로컬 데이터를 우선 병합한다',()=>{
 const remote=[{store:store(),products:[product()]}];
 assert.ok(parsePublicSellerCatalogResponse({stores:remote}));
 assert.equal(parsePublicSellerCatalogResponse({stores:remote,userId:'secret'}),null);
 assert.equal(mergePublicSellerProducts([product({name:'로컬 수정본'})],remote)[0].name,'로컬 수정본');
 assert.equal(mergePublicSellerStores(store({tagline:'로컬 소개'}),remote)[0].tagline,'로컬 소개');
});
