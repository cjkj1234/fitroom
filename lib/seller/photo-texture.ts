// 평면 촬영한 상의 상품 사진에서 옷의 앞면 무늬를 잘라 3D 옷 앞면에 입힐 텍스처를 만든다.
// 사진은 브라우저 안에서만 읽는다. 모델이 입은 착용컷이나 배경이 복잡한 사진은 윤곽을 못 찾을 수 있어 null을 돌려준다.
import {estimateBackground} from './photo-color';

export type GarmentCutout={width:number;height:number;mask:Uint8Array;box:{x0:number;y0:number;x1:number;y1:number}};
export type TextureImage={width:number;height:number;data:Uint8ClampedArray};

const FOREGROUND_DISTANCE=26;

// 배경 색과 충분히 다른 가장 큰 덩어리를 옷으로 보고, 안쪽 구멍(단추·무늬)은 옷에 포함한다.
export function cutOutGarment(pixels:ArrayLike<number>,width:number,height:number):GarmentCutout|null{
 if(width<8||height<8||pixels.length<width*height*4)return null;
 const [br,bg,bb]=estimateBackground(pixels,width,height),size=width*height,foreground=new Uint8Array(size);
 for(let i=0;i<size;i++){const p=i*4;if(pixels[p+3]<200)continue;if(Math.hypot(pixels[p]-br,pixels[p+1]-bg,pixels[p+2]-bb)>=FOREGROUND_DISTANCE)foreground[i]=1;}
 // 가장 큰 연결 덩어리만 남긴다.
 const label=new Int32Array(size),stack:number[]=[];let best=0,bestSize=0,next=0;
 for(let start=0;start<size;start++){
  if(!foreground[start]||label[start])continue;
  next++;let count=0;stack.length=0;stack.push(start);label[start]=next;
  while(stack.length){const i=stack.pop() as number,x=i%width,y=(i-x)/width;count++;
   if(x>0&&foreground[i-1]&&!label[i-1]){label[i-1]=next;stack.push(i-1);}
   if(x<width-1&&foreground[i+1]&&!label[i+1]){label[i+1]=next;stack.push(i+1);}
   if(y>0&&foreground[i-width]&&!label[i-width]){label[i-width]=next;stack.push(i-width);}
   if(y<height-1&&foreground[i+width]&&!label[i+width]){label[i+width]=next;stack.push(i+width);}
  }
  if(count>bestSize){bestSize=count;best=next;}
 }
 if(bestSize<size*.04)return null;
 const mask=new Uint8Array(size);for(let i=0;i<size;i++)if(label[i]===best)mask[i]=1;
 // 가장자리에서 닿는 배경을 채워 나가고, 닿지 못한 빈 곳은 옷 안쪽 구멍이므로 옷으로 메운다.
 const outside=new Uint8Array(size);stack.length=0;
 const seed=(i:number)=>{if(!mask[i]&&!outside[i]){outside[i]=1;stack.push(i);}};
 for(let x=0;x<width;x++){seed(x);seed((height-1)*width+x);}
 for(let y=0;y<height;y++){seed(y*width);seed(y*width+width-1);}
 while(stack.length){const i=stack.pop() as number,x=i%width,y=(i-x)/width;
  if(x>0)seed(i-1);if(x<width-1)seed(i+1);if(y>0)seed(i-width);if(y<height-1)seed(i+width);}
 let x0=width,y0=height,x1=-1,y1=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(!outside[i])mask[i]=1;if(mask[i]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
 return {width,height,mask,box:{x0,y0,x1,y1}};
}

// 상의 앞면에 해당하는 사진 영역. 옷단 쪽(아래 34%)은 소매가 없으니 그 폭을 몸통 폭으로 삼고, 세로는 옷 전체를 쓴다.
export function torsoWindow(cutout:GarmentCutout){
 const {box,mask,width}=cutout,boxHeight=box.y1-box.y0+1,lefts:number[]=[],rights:number[]=[];
 const from=Math.floor(box.y0+boxHeight*.66),to=Math.floor(box.y0+boxHeight*.92);
 for(let y=from;y<=to;y++){let left=-1,right=-1;for(let x=box.x0;x<=box.x1;x++)if(mask[y*width+x]){if(left<0)left=x;right=x;}if(left>=0){lefts.push(left);rights.push(right);}}
 const middle=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
 let x0=lefts.length?middle(lefts):box.x0,x1=rights.length?middle(rights):box.x1;
 if(x1-x0<(box.x1-box.x0)*.25){x0=box.x0;x1=box.x1;}
 // 가장자리 한 뼘은 배경 그림자가 섞이기 쉬워 안쪽으로 조금 들인다.
 const inset=(x1-x0)*.012;
 return {x0:x0+inset,x1:x1-inset,y0:box.y0,y1:box.y1-boxHeight*.015};
}

// 사진에서 window 영역을 size 폭의 텍스처로 옮긴다. 옷이 아닌 곳은 옷의 평균색으로 채워 배경색이 새어 나오지 않게 한다.
export function buildFrontTexture(pixels:ArrayLike<number>,cutout:GarmentCutout,window:{x0:number;x1:number;y0:number;y1:number},size=256):TextureImage{
 const {width,height,mask}=cutout,windowWidth=Math.max(2,window.x1-window.x0),windowHeight=Math.max(2,window.y1-window.y0);
 const outWidth=size,outHeight=Math.max(16,Math.min(512,Math.round(size*windowHeight/windowWidth)));
 let sumR=0,sumG=0,sumB=0,count=0;
 for(let i=0;i<width*height;i+=3)if(mask[i]){sumR+=pixels[i*4];sumG+=pixels[i*4+1];sumB+=pixels[i*4+2];count++;}
 const fill=count?[sumR/count,sumG/count,sumB/count]:[128,128,128],data=new Uint8ClampedArray(outWidth*outHeight*4);
 for(let y=0;y<outHeight;y++)for(let x=0;x<outWidth;x++){
  const sx=window.x0+(x+.5)/outWidth*windowWidth-.5,sy=window.y0+(y+.5)/outHeight*windowHeight-.5;
  const ix=Math.max(0,Math.min(width-2,Math.floor(sx))),iy=Math.max(0,Math.min(height-2,Math.floor(sy))),fx=Math.max(0,Math.min(1,sx-ix)),fy=Math.max(0,Math.min(1,sy-iy));
  const at=(dx:number,dy:number,c:number)=>pixels[((iy+dy)*width+ix+dx)*4+c];
  const inside=mask[iy*width+ix]&&mask[iy*width+ix+1]&&mask[(iy+1)*width+ix]&&mask[(iy+1)*width+ix+1];
  const out=(y*outWidth+x)*4;
  for(let c=0;c<3;c++){const value=(at(0,0,c)*(1-fx)+at(1,0,c)*fx)*(1-fy)+(at(0,1,c)*(1-fx)+at(1,1,c)*fx)*fy;data[out+c]=inside?value:fill[c];}
  data[out+3]=255;
 }
 return {width:outWidth,height:outHeight,data};
}
