import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFrontTexture,cutOutGarment,torsoWindow} from './photo-texture';

type Rgb=[number,number,number];
// 흰 배경 위에 몸통(가운데)과 소매(양옆 위쪽)가 있는 평면 촬영 셔츠, 몸통에 어두운 주머니 무늬가 있는 가짜 사진.
function flatShirt(){
 const width=200,height=240,pixels=new Uint8ClampedArray(width*height*4),body:Rgb=[120,113,95],pocket:Rgb=[60,50,40],background:Rgb=[245,245,245];
 const inside=(x:number,y:number,x0:number,y0:number,x1:number,y1:number)=>x>=x0&&x<x1&&y>=y0&&y<y1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const color:Rgb=inside(x,y,100,90,125,110)?pocket:inside(x,y,60,40,140,200)||inside(x,y,20,40,60,90)||inside(x,y,140,40,180,90)?body:background,i=(y*width+x)*4;
  pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];pixels[i+3]=255;
 }
 return {pixels,width,height};
}

test('평면 촬영 상의의 윤곽과 몸통 영역을 찾는다',()=>{
 const {pixels,width,height}=flatShirt();
 const cutout=cutOutGarment(pixels,width,height);
 assert.ok(cutout);
 assert.ok(Math.abs(cutout.box.x0-20)<=1&&Math.abs(cutout.box.x1-179)<=1&&Math.abs(cutout.box.y0-40)<=1&&Math.abs(cutout.box.y1-199)<=1,JSON.stringify(cutout.box));
 const window=torsoWindow(cutout);
 assert.ok(Math.abs(window.x0-61)<=2&&Math.abs(window.x1-138)<=2,`몸통 폭 ${window.x0}–${window.x1}`);
 assert.equal(window.y0,cutout.box.y0);assert.ok(window.y1<cutout.box.y1&&window.y1>cutout.box.y1-6,`아래 끝 ${window.y1}`);
});

test('몸통 영역을 텍스처로 옮기면 무늬가 제자리에 놓인다',()=>{
 const {pixels,width,height}=flatShirt(),cutout=cutOutGarment(pixels,width,height)!,window=torsoWindow(cutout);
 const texture=buildFrontTexture(pixels,cutout,window,128);
 assert.equal(texture.width,128);
 assert.ok(texture.height>200&&texture.height<300,`높이 ${texture.height}`);
 // 주머니는 몸통 폭의 50–81%, 옷 높이의 31–44% 위치.
 const px=Math.round(.65*texture.width),py=Math.round(.375*texture.height),i=(py*texture.width+px)*4;
 assert.ok(Math.abs(texture.data[i]-60)<8&&Math.abs(texture.data[i+1]-50)<8&&Math.abs(texture.data[i+2]-40)<8,`주머니 색 ${texture.data.slice(i,i+3)}`);
 const corner=(2*texture.width+2)*4;
 assert.ok(Math.abs(texture.data[corner]-120)<10,`몸통 색 ${texture.data[corner]}`);
 assert.equal(texture.data[3],255);
});

test('배경뿐이거나 윤곽이 너무 작은 사진은 만들지 않는다',()=>{
 const blank=new Uint8ClampedArray(100*100*4).fill(250);
 assert.equal(cutOutGarment(blank,100,100),null);
 assert.equal(cutOutGarment(new Uint8ClampedArray(0),0,0),null);
});
