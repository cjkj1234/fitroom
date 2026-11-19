// 평면 촬영한 상품 사진에서 옷 윤곽(마스크)을 찾는다. 실루엣 비율(photo-silhouette.ts)과 상품 사진 자르기(photo-prepare.ts)가 쓴다.
// 옷 후보 픽셀은 두 가지로 얻는다: 배경색과 다른 픽셀(cutOutGarment) 또는 AI 배경 제거 결과(foregroundFromMatte, photo-matting.ts).
// 어느 쪽이든 keepGarment가 같은 규칙으로 정리한다. 사진은 브라우저 안에서만 읽는다. DOM 없이 픽셀 배열만 다뤄 Node 테스트에서도 쓴다.
import {clusterColors,colorDistance,estimateBackground,type Rgb} from './photo-color';

export type GarmentCutout={width:number;height:number;mask:Uint8Array;box:{x0:number;y0:number;x1:number;y1:number}};

const FOREGROUND_DISTANCE=26;

// 배경 색과 충분히 다른 픽셀을 옷 후보로 본다. 흰 배경·회색 배경처럼 배경이 고른 사진에서 쓴다.
export function cutOutGarment(pixels:ArrayLike<number>,width:number,height:number):GarmentCutout|null{
 if(width<8||height<8||pixels.length<width*height*4)return null;
 const [br,bg,bb]=estimateBackground(pixels,width,height),size=width*height,foreground=new Uint8Array(size);
 for(let i=0;i<size;i++){const p=i*4;if(pixels[p+3]<200)continue;if(Math.hypot(pixels[p]-br,pixels[p+1]-bg,pixels[p+2]-bb)>=FOREGROUND_DISTANCE)foreground[i]=1;}
 return keepGarment(foreground,width,height,pixels);
}

// AI 배경 제거 결과(사진 전체를 덮는 mw×mh 알파, 0~255)를 width×height 사진의 옷 후보로 옮긴다(겹선형 보간, 절반 이상이면 옷).
export function foregroundFromMatte(alpha:ArrayLike<number>,mw:number,mh:number,width:number,height:number):Uint8Array{
 const out=new Uint8Array(width*height);
 for(let y=0;y<height;y++){
  const fy=Math.min(mh-1,Math.max(0,(y+.5)*mh/height-.5)),y0=Math.floor(fy),y1=Math.min(mh-1,y0+1),ty=fy-y0;
  for(let x=0;x<width;x++){
   const fx=Math.min(mw-1,Math.max(0,(x+.5)*mw/width-.5)),x0=Math.floor(fx),x1=Math.min(mw-1,x0+1),tx=fx-x0;
   const top=alpha[y0*mw+x0]*(1-tx)+alpha[y0*mw+x1]*tx,bottom=alpha[y1*mw+x0]*(1-tx)+alpha[y1*mw+x1]*tx;
   if(top*(1-ty)+bottom*ty>=128)out[y*width+x]=1;
  }
 }
 return out;
}

// 옷 후보(1)에서 옷 윤곽을 만든다.
// 1) 가장 큰 연결 덩어리만 남긴다(사진에 함께 찍힌 발·그림자 조각 제거). 사진의 4%보다 작으면 null.
// 2) 가장자리에서 닿지 않는 빈 곳(단추·무늬)은 옷 안쪽 구멍이므로 메운다.
// 3) 가늘게 길게 튀어나온 부분(옷걸이 고리·끈·실밥)을 잘라낸다(trimProtrusions).
// 4) pixels를 주면 목 부분에 걸린 옷걸이처럼 옷 위쪽 가장자리에 붙은, 옷과 색이 다른 굵은 물체도 뺀다(removeTopObject).
export function keepGarment(foreground:Uint8Array,width:number,height:number,pixels?:ArrayLike<number>):GarmentCutout|null{
 let mask=largestFilled(foreground,width,height);if(!mask)return null;
 mask=trimProtrusions(mask,width,height);
 if(pixels)mask=removeTopObject(mask,pixels,width,height);
 mask=largestFilled(mask,width,height);if(!mask)return null;
 return withBox(mask,width,height);
}

function withBox(mask:Uint8Array,width:number,height:number):GarmentCutout{
 let x0=width,y0=height,x1=-1,y1=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
 return {width,height,mask,box:{x0,y0,x1,y1}};
}

// 4방향 연결 덩어리 번호(1부터)와 덩어리별 픽셀 수.
function label(on:Uint8Array,width:number,height:number){
 const labels=new Int32Array(on.length),sizes=[0],stack:number[]=[];
 for(let start=0;start<on.length;start++){
  if(!on[start]||labels[start])continue;
  const id=sizes.length;let count=0;stack.length=0;stack.push(start);labels[start]=id;
  while(stack.length){const i=stack.pop() as number,x=i%width,y=(i-x)/width;count++;
   if(x>0&&on[i-1]&&!labels[i-1]){labels[i-1]=id;stack.push(i-1);}
   if(x<width-1&&on[i+1]&&!labels[i+1]){labels[i+1]=id;stack.push(i+1);}
   if(y>0&&on[i-width]&&!labels[i-width]){labels[i-width]=id;stack.push(i-width);}
   if(y<height-1&&on[i+width]&&!labels[i+width]){labels[i+width]=id;stack.push(i+width);}
  }
  sizes.push(count);
 }
 return {labels,sizes};
}

function largestFilled(on:Uint8Array,width:number,height:number):Uint8Array|null{
 const size=width*height,{labels,sizes}=label(on,width,height);
 let best=0;for(let id=1;id<sizes.length;id++)if(sizes[id]>(sizes[best]??0))best=id;
 if(!best||sizes[best]<size*.04)return null;
 const mask=new Uint8Array(size);for(let i=0;i<size;i++)if(labels[i]===best)mask[i]=1;
 // 가장자리에서 닿는 배경을 채워 나가고, 닿지 못한 빈 곳은 옷 안쪽 구멍이므로 옷으로 메운다.
 const outside=new Uint8Array(size),stack:number[]=[];
 const seed=(i:number)=>{if(!mask[i]&&!outside[i]){outside[i]=1;stack.push(i);}};
 for(let x=0;x<width;x++){seed(x);seed((height-1)*width+x);}
 for(let y=0;y<height;y++){seed(y*width);seed(y*width+width-1);}
 while(stack.length){const i=stack.pop() as number,x=i%width,y=(i-x)/width;
  if(x>0)seed(i-1);if(x<width-1)seed(i+1);if(y>0)seed(i-width);if(y<height-1)seed(i+width);}
 for(let i=0;i<size;i++)if(!outside[i])mask[i]=1;
 return mask;
}

// 각 픽셀에서 on이 아닌 가장 가까운 픽셀까지의 거리(px). 3-4 챔퍼 거리(유클리드 거리와 몇 % 차이)를 두 번 훑어 구한다.
// edgeIsOff: 사진 밖을 on이 아닌 것으로 볼지(옷 안쪽 거리) 아니면 아주 먼 것으로 볼지(어떤 영역까지의 거리).
export function distanceToOff(on:Uint8Array,width:number,height:number,edgeIsOff=true):Float32Array{
 const big=1e9,d=new Int32Array(on.length),edge=edgeIsOff?0:big;
 for(let i=0;i<on.length;i++)d[i]=on[i]?big:0;
 const at=(x:number,y:number)=>x<0||y<0||x>=width||y>=height?edge:d[y*width+x];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(!d[i])continue;
  d[i]=Math.min(d[i],at(x-1,y)+3,at(x,y-1)+3,at(x-1,y-1)+4,at(x+1,y-1)+4);}
 for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){const i=y*width+x;if(!d[i])continue;
  d[i]=Math.min(d[i],at(x+1,y)+3,at(x,y+1)+3,at(x+1,y+1)+4,at(x-1,y+1)+4);}
 const out=new Float32Array(on.length);for(let i=0;i<on.length;i++)out[i]=d[i]/3;return out;
}

// 가늘게 튀어나온 부분을 잘라낸다. 반지름 r(옷 상자 짧은 변의 2%)로 열기(깎은 뒤 다시 불리기)를 하면 r보다 가는 부분이 사라진다.
// 사라진 조각 가운데 남은 몸통에서 1.5r보다 멀리 뻗은 것(옷걸이 고리·끈)만 지우고, 소매 끝 모서리처럼 몸통 바로 옆 조각은 둔다.
export function trimProtrusions(mask:Uint8Array,width:number,height:number,radius?:number):Uint8Array{
 const box=withBox(mask,width,height).box,r=radius??Math.max(2,Math.round(Math.min(box.x1-box.x0+1,box.y1-box.y0+1)*.02));
 const inside=distanceToOff(mask,width,height),core=new Uint8Array(mask.length);
 for(let i=0;i<mask.length;i++)if(inside[i]>r)core[i]=1;
 const notCore=new Uint8Array(mask.length);let any=false;for(let i=0;i<mask.length;i++){notCore[i]=core[i]?0:1;if(core[i])any=true;}
 if(!any)return mask;
 const fromCore=distanceToOff(notCore,width,height,false),residue=new Uint8Array(mask.length);
 for(let i=0;i<mask.length;i++)if(mask[i]&&fromCore[i]>r)residue[i]=1;
 const {labels,sizes}=label(residue,width,height),far=new Float32Array(sizes.length);
 for(let i=0;i<mask.length;i++)if(labels[i])far[labels[i]]=Math.max(far[labels[i]],fromCore[i]-r);
 const out=Uint8Array.from(mask);
 for(let i=0;i<mask.length;i++)if(labels[i]&&far[labels[i]]>1.5*r)out[i]=0;
 return out;
}

// 옷 위쪽 가운데(옷 높이 위 30%, 폭 가운데 60%)에서 옷 위 가장자리에 닿아 있고, 옷 아래쪽 70%의 주요 색 어느 것과도 다른
// 굵은 덩어리(옷걸이 나무·플라스틱)를 뺀다. 크기가 옷의 0.3% 이상이고 가장 굵은 곳의 반지름이 옷 폭의 2.2% 이상이며,
// 나머지 옷의 위끝(어깨선)보다 옷 높이의 1.5% 넘게 위로 솟아 있거나, 나머지 옷보다 위에서 사진 위끝에 닿아 있어야 한다
// (옷걸이 고리는 사진 밖으로 잘려 나가곤 한다). 가슴 프린트는 위 가장자리에 닿지 않고,
// 배색 목 립(rib)은 이보다 가늘고, 목둘레 안으로 보이는 뒤판 안쪽은 어깨선 위로 솟지 않아 남는다.
export function removeTopObject(mask:Uint8Array,pixels:ArrayLike<number>,width:number,height:number):Uint8Array{
 const {box}=withBox(mask,width,height),bw=box.x1-box.x0+1,bh=box.y1-box.y0+1;
 if(bw<20||bh<20)return mask;
 const at=(i:number):Rgb=>[pixels[i*4],pixels[i*4+1],pixels[i*4+2]];
 const samples:Rgb[]=[],lowFrom=box.y0+Math.floor(bh*.3),step=Math.max(1,Math.floor(Math.sqrt(bw*bh/20000)));
 let area=0;for(let i=0;i<mask.length;i++)area+=mask[i];
 for(let y=lowFrom;y<=box.y1;y+=step)for(let x=box.x0;x<=box.x1;x+=step)if(mask[y*width+x])samples.push(at(y*width+x));
 const colors=clusterColors(samples,5).filter(c=>c.share>=.03).map(c=>c.center);if(!colors.length)return mask;
 const candidate=new Uint8Array(mask.length),cx=(box.x0+box.x1)/2,xa=Math.ceil(cx-bw*.3),xb=Math.floor(cx+bw*.3);
 for(let y=box.y0;y<lowFrom;y++)for(let x=xa;x<=xb;x++){const i=y*width+x;if(mask[i]&&Math.min(...colors.map(c=>colorDistance(at(i),c)))>50)candidate[i]=1;}
 const {labels,sizes}=label(candidate,width,height),thickness=distanceToOff(candidate,width,height);
 const touches=new Uint8Array(sizes.length),radius=new Float32Array(sizes.length),top=new Int32Array(sizes.length).fill(height);
 for(let i=0;i<mask.length;i++){const id=labels[i];if(!id)continue;radius[id]=Math.max(radius[id],thickness[i]);top[id]=Math.min(top[id],Math.floor(i/width));if(i<width||!mask[i-width])touches[id]=1;}
 const out=Uint8Array.from(mask);let removed=false;
 for(let id=1;id<sizes.length;id++){
  if(!touches[id]||sizes[id]<area*.003||radius[id]<bw*.022)continue;
  let rest=height;for(let i=0;i<mask.length&&rest===height;i++)if(mask[i]&&labels[i]!==id)rest=Math.floor(i/width);
  const above=top[id]<rest-Math.max(2,bh*.015),offFrame=top[id]<=Math.max(1,height*.01)&&top[id]<rest;
  if(!above&&!offFrame)continue;
  removed=true;for(let i=0;i<mask.length;i++)if(labels[i]===id)out[i]=0;
 }
 return removed?out:mask;
}

// 잘라낸 윤곽을 믿을 수 있는지 본다. 사진 테두리의 20% 넘게 옷이 닿거나 사진의 90% 넘게 덮으면 배경까지 옷으로 잡았거나
// 옷이 사진 밖으로 잘린 것이라 3D에 쓰지 않는다. 문제가 없으면 빈 문자열.
export function cutoutProblem(cutout:GarmentCutout):string{
 const {mask,width,height}=cutout;let border=0,area=0;
 for(let x=0;x<width;x++)border+=mask[x]+mask[(height-1)*width+x];
 for(let y=1;y<height-1;y++)border+=mask[y*width]+mask[y*width+width-1];
 for(let i=0;i<mask.length;i++)area+=mask[i];
 if(area>mask.length*.9)return '사진 대부분이 옷으로 잡혔어요(배경과 옷을 구분하지 못했어요)';
 if(border>(2*width+2*height-4)*.2)return '옷 윤곽이 사진 가장자리에 너무 많이 닿아 있어요(배경이 옷으로 잡혔거나 옷이 사진 밖으로 잘렸어요)';
 return '';
}
