import test from 'node:test';
import assert from 'node:assert/strict';
import {objectParticle} from './text';

test('object particle follows the final consonant of Korean product names',()=>{
 assert.equal(objectParticle('와이드 데님 팬츠'),'를');
 assert.equal(objectParticle('스트라이프 반팔 티셔츠'),'를');
 assert.equal(objectParticle('코튼 볼캡'),'을');
 assert.equal(objectParticle('  포인트 오버핏 반팔 '),'을');
 assert.equal(objectParticle('데일리 셔츠 2호'),'를');
 assert.equal(objectParticle('오버핏 1'),'을');
 assert.equal(objectParticle(''),'를');
});
