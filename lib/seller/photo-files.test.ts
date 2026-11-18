import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeDataUrl,newPhotoVersion,photoUploadSchema,productPhotosSchema,PHOTO_LIMITS} from './photo-files';
import {publishedSellerCatalog,sellerProductToWardrobeProduct,serverProductPhotos} from './catalog';
import {emptySellerSize,sellerProductSchema,type SellerProduct} from './products';

const jpeg='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',png='data:image/png;base64,iVBORw0KGgo=';
const now='2026-11-17T00:00:00.000Z';
const base:SellerProduct={version:1,id:'p-1',storeName:'사진상점',name:'체크 셔츠',category:'top',color:'네이비',features:['체크'],material:null,priceKrw:30000,stock:3,purchaseUrl:null,sizes:[{...emptySellerSize('M'),length:72,chestFlat:56}],createdAt:now,updatedAt:now,status:'published',publishedAt:now};

test('상품 사진은 JPEG 사진 + PNG 마스크 data URL만 받고, 크기 제한을 넘거나 다른 형식이면 거부한다',()=>{
 assert.ok(productPhotosSchema.safeParse({front:{image:jpeg,mask:png}}).success);
 assert.ok(productPhotosSchema.safeParse({front:{image:jpeg,mask:png},back:{image:jpeg,mask:png}}).success);
 assert.equal(productPhotosSchema.safeParse({front:{image:png,mask:png}}).success,false,'사진은 JPEG');
 assert.equal(productPhotosSchema.safeParse({front:{image:'data:image/svg+xml;base64,PHN2Zz4=',mask:png}}).success,false);
 assert.equal(productPhotosSchema.safeParse({front:{image:'https://example.com/a.jpg',mask:png}}).success,false,'외부 주소');
 assert.equal(productPhotosSchema.safeParse({front:{image:`data:image/jpeg;base64,${'A'.repeat(PHOTO_LIMITS.imageChars)}`,mask:png}}).success,false,'크기');
 assert.equal(photoUploadSchema.safeParse({productId:'p-1',version:'../x',photos:{front:{image:jpeg,mask:png}}}).success,false,'버전 문자');
 assert.match(newPhotoVersion(),/^[A-Za-z0-9-]{1,40}$/);
});

test('data URL을 바이트로 되돌린다',()=>{
 const decoded=decodeDataUrl(jpeg)!;
 assert.equal(decoded.type,'image/jpeg');assert.deepEqual([...decoded.bytes.slice(0,3)],[0xff,0xd8,0xff]);
 assert.equal(decodeDataUrl('data:text/html;base64,PGI+'),null);
});

test('상품 사진 표시: 이 브라우저 사진이 있으면 그것을, 없으면 버전이 붙은 서버 주소를 쓰고, 매장 옷걸이 사진도 상품 사진으로 바뀐다',()=>{
 const withPhoto={...base,photo:{version:'v1-abc',back:true}};
 assert.ok(sellerProductSchema.safeParse(withPhoto).success);
 const server=serverProductPhotos(withPhoto)!;
 assert.match(server.front.image,/^\/api\/catalog\/photo\?product=p-1&side=front&kind=image&v=v1-abc$/);
 assert.match(server.back!.mask,/side=back&kind=mask&v=v1-abc$/);
 assert.equal(serverProductPhotos({...withPhoto,photo:{version:'v1',back:false}})!.back,undefined);
 const local={front:{image:jpeg,mask:png}};
 const fromLocal=sellerProductToWardrobeProduct(withPhoto,local);assert.equal(fromLocal.photos,local);assert.equal(fromLocal.image,jpeg);
 const fromServer=sellerProductToWardrobeProduct(withPhoto);assert.equal(fromServer.image,server.front.image);
 const plain=sellerProductToWardrobeProduct(base);assert.equal(plain.photos,undefined);assert.match(plain.image,/^\/catalog\//);
 assert.equal(sellerProductToWardrobeProduct({...withPhoto,category:'hat',sizes:[{...emptySellerSize('F'),headCirc:58}]}).photos,undefined,'모자는 사진을 입히지 않는다');
 // 사진 표시(photo)가 지워진 상품은 이 브라우저에 사진이 남아 있어도 쓰지 않는다.
 assert.equal(publishedSellerCatalog([base],{'p-1':local})[0].photos,undefined);
 assert.equal(publishedSellerCatalog([withPhoto],{'p-1':local})[0].photos,local);
});
