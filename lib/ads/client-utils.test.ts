import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDraftText,parseOptionalNumberInput,safeDownloadBaseName} from './client-utils';

test('optional number input accepts readable numeric forms and rejects mixed text',()=>{
 assert.equal(parseOptionalNumberInput(''),null);
 assert.equal(parseOptionalNumberInput('29,000원'),29000);
 assert.equal(parseOptionalNumberInput('10%'),10);
 assert.equal(Number.isNaN(parseOptionalNumberInput('-10')),true);
 assert.equal(Number.isNaN(parseOptionalNumberInput('29,00원')),true);
 assert.equal(Number.isNaN(parseOptionalNumberInput('가격 29000')),true);
});

test('download names remove path and reserved characters',()=>{
 assert.equal(safeDownloadBaseName('  가을/겨울: 티셔츠?  '),'가을-겨울- 티셔츠-');
 assert.equal(safeDownloadBaseName(' ... '),'상품');
});

test('edited hashtags are normalized only for exported text',()=>{
 const result=formatDraftText({headline:'제목',body:'본문',cta:'상품 보기',hashtags:'오후옷장, #반팔티 데일리룩'});
 assert.equal(result,'제목\n\n본문\n\n상품 보기\n\n#오후옷장 #반팔티 #데일리룩');
});
