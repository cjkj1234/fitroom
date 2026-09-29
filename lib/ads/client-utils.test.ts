import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDraftText,parseOptionalNumberInput,safeDownloadBaseName,sellerProductToAdFields} from './client-utils';
import {emptySellerSize,type SellerProduct} from '../seller/products';

const registered:SellerProduct={version:1,id:'p1',storeName:'우리동네옷가게',name:'와이드 데님 팬츠',category:'bottom',color:'인디고',features:['와이드 핏','하이웨이스트'],material:null,priceKrw:45000,stock:8,purchaseUrl:null,sizes:[{...emptySellerSize('M'),length:98,waistFlat:38}],createdAt:'2026-09-29T00:00:00.000Z',updatedAt:'2026-09-29T00:00:00.000Z',status:'published',publishedAt:'2026-09-29T00:00:00.000Z'};

test('registered products become ad fields without inventing missing facts',()=>{
 assert.deepEqual(sellerProductToAdFields(registered),{storeName:'우리동네옷가게',productName:'와이드 데님 팬츠',category:'bottom',color:'인디고',features:'와이드 핏, 하이웨이스트',material:'',price:'45000',discount:''});
 const bare=sellerProductToAdFields({...registered,priceKrw:null,material:'코튼 데님'});
 assert.equal(bare.price,'');
 assert.equal(bare.material,'코튼 데님');
});

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
