// Run from the repository root: node docs/ads/check-contract.mjs
// This checks the design fixtures without network calls or API usage.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adRequestSchema,adResponseSchema} from './contracts.mjs';
const read = name => JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const example=read('example.json');
assert.ok(example.notice.includes('API 생성 결과가 아닙니다'));
assert.ok(adRequestSchema.safeParse(example.request).success);
assert.ok(adResponseSchema.safeParse(example.response).success);
for(const entry of read('evaluation-cases.json').cases){
 const result=adRequestSchema.safeParse(entry.request);
 assert.equal(result.success,entry.expectedValid,entry.id);
 console.log(`${entry.id}: ${result.success?'accepted':'rejected as expected'}`);
}
const original=structuredClone(example.request);
assert.equal(adRequestSchema.safeParse({...original,photo:'unexpected image payload'}).success,false);
assert.deepEqual(original,example.request);
assert.equal(adResponseSchema.safeParse({drafts:example.response.drafts.slice(0,2)}).success,false);
const duplicate=structuredClone(example.response);
duplicate.drafts[1].angle=duplicate.drafts[0].angle;
assert.equal(adResponseSchema.safeParse(duplicate).success,false);
const tooLong=structuredClone(example.response);
tooLong.drafts[0].headline='가'.repeat(41);
assert.equal(adResponseSchema.safeParse(tooLong).success,false);
const withPrefix=structuredClone(example.response);
withPrefix.drafts[0].hashtags[0]='#해시태그';
assert.equal(adResponseSchema.safeParse(withPrefix).success,false);
const outputSchema=read('model-response.schema.json');
function checkObject(node){
 if(node.type==='object'){
  assert.equal(node.additionalProperties,false);
  assert.deepEqual([...node.required].sort(),Object.keys(node.properties).sort());
  for(const child of Object.values(node.properties))checkObject(child);
 }
 if(node.type==='array')checkObject(node.items);
}
checkObject(outputSchema);
assert.deepEqual(Object.keys(example.response.drafts[0]).sort(),Object.keys(outputSchema.properties.drafts.items.properties).sort());
console.log('8 input cases, example output, rejection checks, and model schema structure passed.');
console.log('No model was called; generation quality and API access remain untested.');
