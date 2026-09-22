import test from 'node:test';
import assert from 'node:assert/strict';
import {createWardrobeCollection,parseStoredWardrobeCollection,removeSavedLook,saveWardrobeLook,toggleFavoriteProduct} from './collection';

test('collection storage ignores corrupt or unexpected data',()=>{
 assert.deepEqual(parseStoredWardrobeCollection('{bad'),createWardrobeCollection());
 assert.deepEqual(parseStoredWardrobeCollection(JSON.stringify({version:1,favoriteProductIds:['p1'],looks:[],photo:'no'})),createWardrobeCollection());
});

test('favorite products toggle without duplicates',()=>{
 const added=toggleFavoriteProduct(createWardrobeCollection(),'p1');
 assert.deepEqual(added.favoriteProductIds,['p1']);
 assert.deepEqual(toggleFavoriteProduct(added,'p1').favoriteProductIds,[]);
});

test('saved looks deduplicate, refresh and can be removed',()=>{
 const outfit={top:{productId:'p1',size:'M'},bottom:{productId:'p2',size:'30'}};
 const first=saveWardrobeLook(createWardrobeCollection(),outfit,'look-1','2026-09-22T00:00:00.000Z');
 const refreshed=saveWardrobeLook(first,outfit,'ignored','2026-09-22T01:00:00.000Z');
 assert.equal(refreshed.looks.length,1);
 assert.equal(refreshed.looks[0].id,'look-1');
 assert.equal(refreshed.looks[0].savedAt,'2026-09-22T01:00:00.000Z');
 assert.deepEqual(removeSavedLook(refreshed,'look-1').looks,[]);
});

test('an empty outfit is not saved',()=>{
 const collection=createWardrobeCollection();
 assert.equal(saveWardrobeLook(collection,{},'empty'),collection);
});
