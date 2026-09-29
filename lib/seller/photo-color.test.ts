import test from 'node:test';
import assert from 'node:assert/strict';
import {dominantColors} from './photo-color';

// 흰 배경 위에 가운데 옷 색 사각형이 있는 가짜 상품 사진을 만든다.
function photo(width:number,height:number,background:[number,number,number],blocks:Array<{x0:number;y0:number;x1:number;y1:number;color:[number,number,number]}>){
 const pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,block=blocks.find(item=>x>=item.x0&&x<item.x1&&y>=item.y0&&y<item.y1),color=block?.color??background;
  pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];pixels[i+3]=255;
 }
 return pixels;
}
const hexToRgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));

test('배경을 뺀 옷의 대표색을 찾는다',()=>{
 const pixels=photo(200,240,[248,248,248],[{x0:50,y0:50,x1:150,y1:200,color:[106,91,66]}]);
 const [main]=dominantColors(pixels,200,240);
 assert.ok(main);
 const rgb=hexToRgb(main);
 assert.ok(Math.abs(rgb[0]-106)<4&&Math.abs(rgb[1]-91)<4&&Math.abs(rgb[2]-66)<4,`대표색 ${main}`);
});

test('큰 덩어리부터 돌려주고 검은 옷도 배경과 구분한다',()=>{
 const pixels=photo(200,240,[240,240,240],[{x0:40,y0:40,x1:160,y1:160,color:[30,32,36]},{x0:40,y0:160,x1:160,y1:210,color:[150,120,80]}]);
 const colors=dominantColors(pixels,200,240,2);
 assert.equal(colors.length,2);
 const first=hexToRgb(colors[0]);
 assert.ok(first[0]<60&&first[2]<60,`가장 큰 덩어리는 검정 ${colors[0]}`);
});

test('사진이 비었거나 배경뿐이면 후보를 만들지 않는다',()=>{
 assert.deepEqual(dominantColors(new Uint8ClampedArray(0),0,0),[]);
 assert.deepEqual(dominantColors(photo(100,100,[255,255,255],[]),100,100),[]);
});
