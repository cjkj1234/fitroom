import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultSellerStore,parseStoredSellerStore,placeSellerProduct,publishSellerStore,removeSellerProductPlacement,sellerStoreLayout,sellerStoreReadiness} from './store';

test('store profile safely ignores corrupt storage',()=>{
 assert.equal(parseStoredSellerStore('{bad'),null);
 assert.equal(parseStoredSellerStore(JSON.stringify({version:1,storeName:'x'})),null);
});

test('placing a product moves it between zones without duplicates',()=>{
 const profile=createDefaultSellerStore('테스트상점','2026-09-21T00:00:00.000Z');
 const first=placeSellerProduct(profile,'p1','left-wall');
 const moved=placeSellerProduct(first,'p1','center-rack');
 assert.deepEqual(moved.placements,[{productId:'p1',zone:'center-rack'}]);
 assert.deepEqual(removeSellerProductPlacement(moved,'p1').placements,[]);
});

test('shopper layout preserves seller zones and omits unavailable products',()=>{
 let profile=createDefaultSellerStore('테스트상점','2026-09-21T00:00:00.000Z');
 profile=placeSellerProduct(profile,'p1','left-wall');
 profile=placeSellerProduct(profile,'p2','feature-table');
 profile=placeSellerProduct(profile,'removed','right-wall');
 assert.deepEqual(sellerStoreLayout(profile,['p1','p2']),{
  'left-wall':['p1'],
  'center-rack':[],
  'right-wall':[],
  'feature-table':['p2'],
 });
});

test('store publication requires a published and placed product plus preview confirmation',()=>{
 let profile=createDefaultSellerStore('테스트상점','2026-09-21T00:00:00.000Z');
 assert.equal(sellerStoreReadiness(profile,['p1']).complete,3);
 profile=placeSellerProduct(profile,'p1','feature-table');
 assert.equal(sellerStoreReadiness(profile,['p1']).complete,4);
 profile={...profile,previewConfirmed:true};
 const published=publishSellerStore(profile,['p1'],'2026-09-21T01:00:00.000Z');
 assert.equal(published?.status,'published');
 assert.equal(sellerStoreReadiness(profile,[]).ready,false);
});
