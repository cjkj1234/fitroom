import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {PRODUCTS} from './catalog';
import {analyzeBottomLayout,analyzeTopLayout,cutoutFromMask} from './photo-layout';
import {shoulderToChest} from './photo-assets';

// 8비트 흑백(또는 RGB/RGBA) PNG를 읽어 0/1 마스크로 만든다. 시연 사진 마스크 검사용(줄 필터 5종을 푼다).
function readMaskPng(path:URL){
 const data=readFileSync(path);let offset=8,width=0,height=0,colorType=0;const chunks:Buffer[]=[];
 while(offset<data.length){
  const length=data.readUInt32BE(offset),type=data.toString('ascii',offset+4,offset+8),body=data.subarray(offset+8,offset+8+length);
  if(type==='IHDR'){width=body.readUInt32BE(0);height=body.readUInt32BE(4);assert.equal(body[8],8,'8비트');colorType=body[9];assert.equal(body[12],0,'인터레이스 없음');}
  if(type==='IDAT')chunks.push(body);
  offset+=12+length;
 }
 const channels={0:1,2:3,4:2,6:4}[colorType as 0|2|4|6];assert.ok(channels,`색 형식 ${colorType}`);
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,out=new Uint8Array(width*height),prev=new Uint8Array(stride),line=new Uint8Array(stride);
 for(let y=0;y<height;y++){
  const filter=raw[y*(stride+1)],src=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1));
  for(let i=0;i<stride;i++){
   const a=i>=channels?line[i-channels]:0,b=prev[i],c=i>=channels?prev[i-channels]:0;
   const predictor=filter===1?a:filter===2?b:filter===3?(a+b)>>1:filter===4?(()=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;})():0;
   line[i]=(src[i]+predictor)&255;
  }
  for(let x=0;x<width;x++)out[y*width+x]=line[x*channels]>127?1:0;
  prev.set(line);
 }
 return {width,height,mask:out};
}

test('시연 상의·하의는 앞·뒤 사진과 마스크가 있고, 마스크에서 3D 배치(몸판·소매 또는 가랑이·두 다리)를 잴 수 있다',()=>{
 const withPhotos=PRODUCTS.filter(p=>p.photos);
 assert.equal(withPhotos.length,PRODUCTS.filter(p=>p.slot!=='hat').length);
 for(const product of withPhotos){
  for(const side of [product.photos!.front,product.photos!.back!]){
   for(const url of [side.image,side.mask])assert.ok(existsSync(new URL(`../../public${url}`,import.meta.url)),url);
   const {width,height,mask}=readMaskPng(new URL(`../../public${side.mask}`,import.meta.url));
   assert.ok(Math.max(width,height)<=720);
   const cutout=cutoutFromMask(mask,width,height)!;
   if(product.slot==='top'){
    const {layout,reason}=analyzeTopLayout(cutout,shoulderToChest(product));
    assert.ok(layout,`${product.name} ${side.mask}: ${reason}`);
    assert.ok(layout.sleeves[0]&&layout.sleeves[1],`${product.name} 소매`);
   }else{
    const {layout,reason}=analyzeBottomLayout(cutout);
    assert.ok(layout,`${product.name} ${side.mask}: ${reason}`);
   }
  }
  assert.equal(product.image,product.photos!.front.image,'매장 옷걸이에 앞 사진');
 }
});
