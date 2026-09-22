import test from 'node:test';
import assert from 'node:assert/strict';
import {createWardrobeCollection} from './collection';
import {appendInterestEvent,createInterestLog,parseStoredInterestLog,summarizeProductInterest} from './interest';

test('interest storage ignores malformed and unexpected records',()=>{
 assert.deepEqual(parseStoredInterestLog('{broken'),createInterestLog());
 assert.deepEqual(parseStoredInterestLog(JSON.stringify({version:1,events:[{type:'unknown'}]})),createInterestLog());
});

test('interest events remove duplicate product ids and keep the newest 200',()=>{
 let log=createInterestLog();
 for(let index=0;index<205;index++)log=appendInterestEvent(log,'try_on',['seller:a','seller:a'],`event-${index}`,new Date(Date.UTC(2026,8,22,0,0,index)).toISOString());
 assert.equal(log.events.length,200);
 assert.deepEqual(log.events[0].productIds,['seller:a']);
 assert.equal(log.events[0].id,'event-204');
});

test('product summaries combine current collection state and recorded activity',()=>{
 const collection={...createWardrobeCollection(),favoriteProductIds:['seller:a'],looks:[{id:'look',name:'코디 1',savedAt:'2026-09-22T00:00:00.000Z',outfit:{top:{productId:'seller:a',size:'M'},bottom:{productId:'seller:b',size:'30'}}}]};
 let log=createInterestLog();
 log=appendInterestEvent(log,'try_on',['seller:a'],'try','2026-09-22T01:00:00.000Z');
 log=appendInterestEvent(log,'recommendation_open',['seller:a'],'recommend','2026-09-22T02:00:00.000Z');
 const [first,second]=summarizeProductInterest(['seller:a','seller:b'],collection,log);
 assert.deepEqual(first,{productId:'seller:a',favorite:1,savedLooks:1,tryOns:1,recommendationOpens:1,score:10,lastOccurredAt:'2026-09-22T02:00:00.000Z'});
 assert.equal(second.productId,'seller:b');
 assert.equal(second.score,3);
});
