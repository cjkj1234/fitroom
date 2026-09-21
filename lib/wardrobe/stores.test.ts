import test from 'node:test';
import assert from 'node:assert/strict';
import {PRODUCTS} from './catalog';
import {buildVirtualStores} from './stores';

test('demo catalog becomes three enterable small-business stores',()=>{
 const stores=buildVirtualStores(PRODUCTS);
 assert.deepEqual(stores.map(store=>[store.name,store.products.length]),[['모퉁이상점',3],['오후옷장',3],['골목테일러',2]]);
 assert.deepEqual(stores.find(store=>store.name==='오후옷장')?.slots,['top','bottom','hat']);
});

test('a newly published seller store is promoted to the front of the street',()=>{
 const seller={...PRODUCTS[0],id:'seller:live',brand:'새벽상점',source:'seller' as const};
 const [first]=buildVirtualStores([...PRODUCTS,seller]);
 assert.equal(first.name,'새벽상점');
 assert.equal(first.hasLiveSellerItems,true);
});
