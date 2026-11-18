// 평면 촬영한 상품 사진에서 옷 윤곽(마스크)을 찾는다. 실루엣 비율(photo-silhouette.ts)과 상품 사진 자르기(photo-prepare.ts)가 쓴다.
// 사진은 브라우저 안에서만 읽는다. 모델이 입은 착용컷이나 배경이 복잡한 사진은 윤곽을 못 찾을 수 있어 null을 돌려준다.
import {estimateBackground} from './photo-color';

export type GarmentCutout={width:number;height:number;mask:Uint8Array;box:{x0:number;y0:number;x1:number;y1:number}};

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

