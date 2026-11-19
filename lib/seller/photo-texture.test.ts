import test from 'node:test';
import assert from 'node:assert/strict';
import {cutOutGarment,cutoutProblem,foregroundFromMatte,keepGarment} from './photo-texture';

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

test('평면 촬영 상의의 윤곽을 찾고, 안쪽 무늬(주머니)는 옷에 포함한다',()=>{
 const {pixels,width,height}=flatShirt();
 const cutout=cutOutGarment(pixels,width,height);
 assert.ok(cutout);
 assert.ok(Math.abs(cutout.box.x0-20)<=1&&Math.abs(cutout.box.x1-179)<=1&&Math.abs(cutout.box.y0-40)<=1&&Math.abs(cutout.box.y1-199)<=1,JSON.stringify(cutout.box));
 assert.equal(cutout.mask[100*width+110],1,'주머니');
 assert.equal(cutout.mask[20*width+20],0,'배경');
});

test('배경뿐이거나 윤곽이 너무 작은 사진은 만들지 않는다',()=>{
 const blank=new Uint8ClampedArray(100*100*4).fill(250);
 assert.equal(cutOutGarment(blank,100,100),null);
 assert.equal(cutOutGarment(new Uint8ClampedArray(0),0,0),null);
});

type Paint=(x:number,y:number)=>Rgb|null;
// width×height 사진을 칠한다. paint가 null이면 흰 배경.
function painted(width:number,height:number,paint:Paint){
 const pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const c=paint(x,y)??[245,245,245],i=(y*width+x)*4;pixels[i]=c[0];pixels[i+1]=c[1];pixels[i+2]=c[2];pixels[i+3]=255;}
 return pixels;
}
// 몸판 60~140 × 40~200, 소매 20~60·140~180 × 40~90 인 평면 티셔츠 모양.
const shirt=(x:number,y:number)=>(x>=60&&x<140&&y>=40&&y<200)||(((x>=20&&x<60)||(x>=140&&x<180))&&y>=40&&y<90);

test('옷 밖에 따로 찍힌 조각(발·그림자)은 버리고, 가늘게 튀어나온 끈·고리는 잘라내되 소매 모서리는 남긴다',()=>{
 const body:Rgb=[120,113,95];
 const pixels=painted(200,240,(x,y)=>shirt(x,y)||(x>=96&&x<99&&y>=6&&y<40)||(x>=170&&x<190&&y>=215&&y<235)?body:null);
 const cutout=cutOutGarment(pixels,200,240);assert.ok(cutout);
 assert.ok(cutout.box.y0>=38,`옷 위로 솟은 3px 고리는 몸판 바로 위 밑동만 남는다(위끝 ${cutout.box.y0})`);assert.equal(cutout.box.y1,199,'아래쪽 따로 떨어진 조각은 버린다');
 assert.equal(cutout.mask[40*200+20],1,'소매 바깥 모서리');assert.equal(cutout.mask[89*200+179],1,'소매 아래 모서리');
});

test('목 부분에 걸린 옷걸이(어깨선 위로 솟은 다른 색 덩어리)는 빼고, 목둘레 안으로 보이는 뒤판 안쪽은 남긴다',()=>{
 const body:Rgb=[200,200,196],wood:Rgb=[150,110,50],shadow:Rgb=[110,110,118];
 // 옷걸이: 목 가운데에서 어깨선(y=40) 위로 26px 솟은 굵은 나무 덩어리.
 const hanger=(x:number,y:number)=>x>=80&&x<120&&y>=14&&y<52;
 const withHanger=cutOutGarment(painted(200,240,(x,y)=>hanger(x,y)?wood:shirt(x,y)?body:null),200,240);
 assert.ok(withHanger);assert.equal(withHanger.box.y0,40,'옷걸이를 빼면 옷 위끝은 어깨선');
 assert.equal(withHanger.mask[45*200+100],0,'옷걸이 자리');assert.equal(withHanger.mask[45*200+70],1,'어깨');
 // 사진 위끝 밖으로 잘린 고리(위로 솟은 정도는 작아도 사진 끝에 닿음)도 뺀다.
 const offFrame=cutOutGarment(painted(200,240,(x,y)=>x>=80&&x<120&&y<52?wood:x>=60&&x<140&&y>=3&&y<200?body:null),200,240);
 assert.ok(offFrame);assert.equal(offFrame.mask[20*200+100],0,'사진 끝에 닿은 옷걸이');
 // 같은 자리라도 어깨선 위로 솟지 않은 어두운 목 안쪽은 옷이다.
 const inner=cutOutGarment(painted(200,240,(x,y)=>x>=80&&x<120&&y>=40&&y<60?shadow:shirt(x,y)?body:null),200,240);
 assert.ok(inner);assert.equal(inner.mask[45*200+100],1,'목 안쪽');
});

test('AI 알파를 사진 크기로 옮기고, 같은 규칙으로 옷 윤곽을 만든다',()=>{
 // 64×64 알파의 가운데 32×32가 옷이면, 100×50 사진에서는 가운데 50×25가 옷이다.
 const alpha=new Uint8Array(64*64);for(let y=16;y<48;y++)for(let x=16;x<48;x++)alpha[y*64+x]=255;
 const cutout=keepGarment(foregroundFromMatte(alpha,64,64,100,50),100,50);
 assert.ok(cutout);
 assert.ok(Math.abs(cutout.box.x0-25)<=1&&Math.abs(cutout.box.x1-74)<=1&&Math.abs(cutout.box.y0-12)<=1&&Math.abs(cutout.box.y1-37)<=1,JSON.stringify(cutout.box));
});

test('사진 테두리에 많이 닿거나 사진 대부분을 덮는 윤곽은 믿지 않는다',()=>{
 const ok=cutOutGarment(painted(200,240,(x,y)=>shirt(x,y)?[120,113,95]:null),200,240)!;
 assert.equal(cutoutProblem(ok),'');
 // 나무 바닥처럼 배경까지 옷으로 잡힌 경우: 사진 전체가 옷.
 const full=new Uint8Array(100*100).fill(1);
 assert.match(cutoutProblem({width:100,height:100,mask:full,box:{x0:0,y0:0,x1:99,y1:99}}),/대부분/);
 // 옷이 사진 아래로 잘린 경우: 아래 가장자리와 양옆 절반이 옷.
 const cut=new Uint8Array(100*100);for(let y=40;y<100;y++)for(let x=10;x<90;x++)cut[y*100+x]=1;for(let y=50;y<100;y++){cut[y*100]=1;cut[y*100+99]=1;}
 assert.match(cutoutProblem({width:100,height:100,mask:cut,box:{x0:0,y0:40,x1:99,y1:99}}),/가장자리/);
});
