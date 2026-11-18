// 테스트용 가짜 평면 촬영 사진. 흰 배경 위에 다각형(몸판·소매·바지)을 칠하고 cutOutGarment로 옷 마스크를 만든다.
import {cutOutGarment} from '../seller/photo-texture';

export type Point=[number,number];
export const BACKGROUND=[246,246,244] as const;
type Paint=(x:number,y:number)=>[number,number,number];

export function flatLay(width:number,height:number,polygons:Point[][],paint:Paint=()=>[96,104,88]){
 const pixels=new Uint8ClampedArray(width*height*4);
 const inside=(x:number,y:number,poly:Point[])=>{let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;}return hit;};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const garment=polygons.some(poly=>inside(x+.5,y+.5,poly)),i=(y*width+x)*4,c=garment?paint(x,y):BACKGROUND;
  pixels[i]=c[0];pixels[i+1]=c[1];pixels[i+2]=c[2];pixels[i+3]=255;
 }
 const cutout=cutOutGarment(pixels,width,height);
 if(!cutout)throw new Error('fixture: no garment');
 return {pixels,cutout};
}
// 400×320 사진. 위끝 40, 가운데 x=200, 가슴 160px(120~280), 겨드랑이 112, 밑단 280. 소매는 어깨에서 바깥 아래로 뻗는다.
export function teePhoto(paint?:Paint){
 const top=40,armpit=112,bottom=280,c=200,half=80,shoulder=76;
 const body:Point[]=[[c-shoulder,top],[c+shoulder,top],[c+half,armpit],[c+half,bottom],[c-half,bottom],[c-half,armpit]];
 const sleeve=(side:1|-1):Point[]=>[[c+side*(shoulder-4),top+2],[c+side*(shoulder+66),top+40],[c+side*(half+49),armpit+22],[c+side*(half-2),armpit]];
 return flatLay(400,320,[body,sleeve(1),sleeve(-1)],paint);
}
// 400×420 사진. 허리 40(140~260), 가랑이 약 150, 밑단 380. 두 다리는 밑단에서 138~188, 212~262.
export function pantsPhoto(paint?:Paint){
 const top=40,crotch=150,bottom=380;
 const outline:Point[]=[[140,top],[260,top],[268,crotch],[262,bottom],[212,bottom],[201,crotch+4],[199,crotch+4],[188,bottom],[138,bottom],[132,crotch]];
 return flatLay(400,420,[outline],paint);
}
