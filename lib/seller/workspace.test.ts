import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySellerSize,type SellerProduct} from './products';
import {createDefaultSellerStore} from './store';
import {createSellerWorkspacePayload,parseSellerWorkspaceRow,sellerWorkspacePayloadSchema,sellerWorkspaceSummary} from './workspace';

const now='2026-09-23T00:00:00.000Z';
const product:SellerProduct={version:1,id:'p1',storeName:'오후옷장',name:'스트라이프 반팔',category:'top',color:'네이비',features:['스트라이프'],material:null,priceKrw:29000,stock:3,purchaseUrl:null,sizes:[{...emptySellerSize('M'),length:70,chestFlat:56}],createdAt:now,updatedAt:now,status:'published',publishedAt:now};

test('seller workspace validates products and store as one account snapshot',()=>{
 const payload=createSellerWorkspacePayload([product],createDefaultSellerStore('오후옷장',now));
 assert.ok(payload);
 assert.equal(payload.products[0].id,'p1');
 assert.equal(createSellerWorkspacePayload([{...product,name:''}],null),null);
 assert.equal(sellerWorkspacePayloadSchema.safeParse({...payload,extra:true}).success,false);
});

test('seller workspace row round-trips JSON and rejects corrupt server data',()=>{
 const store=createDefaultSellerStore('오후옷장',now);
 const parsed=parseSellerWorkspaceRow({productsJson:JSON.stringify([product]),storeJson:JSON.stringify(store),updatedAt:now});
 assert.deepEqual(parsed,{version:1,products:[product],store,updatedAt:now});
 assert.deepEqual(sellerWorkspaceSummary(parsed),{productCount:1,publishedCount:1,hasStore:true,updatedAt:now});
 assert.equal(parseSellerWorkspaceRow({productsJson:'{bad',storeJson:null,updatedAt:now}),null);
});
