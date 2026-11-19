// 판매자가 고른 상품 사진 한 장을 분석한다: 옷 윤곽을 찾아(배경색 방식 또는 AI 배경 제거) 대표색 후보, 상의·바지 실루엣 비율,
// 상품 사진(옷 둘레로 자른 JPEG + 흑백 옷 마스크 PNG)을 만들고, 3D 옷에 입힐 수 있는지(몸판·소매·가랑이를 찾는지) 미리 확인한다.
// 브라우저 전용(canvas). 원본 사진은 저장하지 않는다.
import {cutOutGarment,cutoutProblem,foregroundFromMatte,keepGarment,type GarmentCutout} from './photo-texture';
import {dominantColors} from './photo-color';
import {PHOTO_LIMITS,PHOTO_MAX_SIDE} from './photo-files';
import {analyzeBottomSilhouette,analyzeTopSilhouette,type BottomSilhouette,type TopSilhouette} from './photo-silhouette';
import type {Matte} from './photo-matting';
import {analyzeBottomLayout,analyzeTopLayout,cutoutFromMask} from '../wardrobe/photo-layout';
import type {ProductPhoto} from '../wardrobe/types';

// photo: 저장할 사진(옷을 못 찾았거나 너무 크면 null). top·bottom: 그 사진을 상의·하의 3D에 입힐 수 있는지와 못 하는 이유.
// 카테고리를 사진을 고른 뒤에 바꿀 수 있어 둘 다 확인해 둔다.
export type PreparedPhoto={photo:ProductPhoto|null;reason:string;top:string|null;bottom:string|null};
export type CutoutMethod='ai'|'color';
// method: 옷 윤곽을 찾은 방법. colors: 대표색 후보(#rrggbb). top·bottom: 사진에서 잰 상의 몸판·바지 다리 실루엣(못 재면 이유).
export type PhotoAnalysis={method:CutoutMethod;prepared:PreparedPhoto;colors:string[];top:{silhouette:TopSilhouette|null;reason:string};bottom:{silhouette:BottomSilhouette|null;reason:string}};
// 사진의 AI 알파를 구하는 함수(photo-matting.ts의 computeMatte). 없으면 배경색 방식을 쓴다.
export type MatteSource=(image:HTMLImageElement)=>Promise<Matte>;

const failed=(reason:string):PreparedPhoto=>({photo:null,reason,top:reason,bottom:reason});
const PROBE_SIDE=420;

function loadImage(source:string){
 return new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('사진을 읽지 못했어요'));img.src=source;});
}
function canvas(width:number,height:number){
 const c=document.createElement('canvas');c.width=width;c.height=height;const context=c.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('canvas');return {c,context};
}
// 0~1 값 격자(w×h)를 실수 좌표 (x,y)에서 겹선형 보간한다.
function sample(values:ArrayLike<number>,w:number,h:number,x:number,y:number){
 const fx=Math.min(w-1,Math.max(0,x)),fy=Math.min(h-1,Math.max(0,y)),x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),tx=fx-x0,ty=fy-y0;
 return (values[y0*w+x0]*(1-tx)+values[y0*w+x1]*tx)*(1-ty)+(values[y1*w+x0]*(1-tx)+values[y1*w+x1]*tx)*ty;
}

// 옷 윤곽은 긴 변 420px로 줄인 사진에서 찾는다(실루엣 측정 기준 크기). matte를 주면 AI 배경 제거 결과를 쓰고, 그 오류는 그대로 던진다
// (부르는 쪽이 배경색 방식으로 다시 할지 정한다).
export async function analyzeProductPhoto(source:string,shoulderToChest=.92,matte?:MatteSource):Promise<PhotoAnalysis>{
 const image=await loadImage(source);
 const small=Math.min(1,PROBE_SIDE/Math.max(image.width,image.height)),sw=Math.max(2,Math.round(image.width*small)),sh=Math.max(2,Math.round(image.height*small));
 const probe=canvas(sw,sh);probe.context.drawImage(image,0,0,sw,sh);
 const pixels=probe.context.getImageData(0,0,sw,sh).data;
 const alpha=matte?await matte(image):null;
 const cutout=alpha?keepGarment(foregroundFromMatte(alpha.alpha,alpha.width,alpha.height,sw,sh),sw,sh,pixels):cutOutGarment(pixels,sw,sh);
 const method:CutoutMethod=alpha?'ai':'color',problem=cutout?cutoutProblem(cutout):'옷 윤곽을 찾지 못했어요';
 // AI로 옷을 찾았으면 옷 안쪽 픽셀에서만 대표색을 고른다(나무 바닥·발 같은 배경색이 섞이지 않게).
 const colors=dominantColors(pixels,sw,sh,3,alpha&&cutout&&!problem?cutout.mask:undefined);
 if(!cutout||problem)return {method,prepared:failed(problem),colors,top:{silhouette:null,reason:problem},bottom:{silhouette:null,reason:problem}};
 return {method,prepared:cropPhoto(image,cutout,small,shoulderToChest,alpha),colors,top:analyzeTopSilhouette(cutout),bottom:analyzeBottomSilhouette(cutout)};
}

// 옷 둘레에 4% 여백을 두고 자른 뒤 긴 변을 PHOTO_MAX_SIDE 이하로 줄이고, 같은 크기의 옷 마스크를 만든다.
// 마스크는 420px 윤곽을 겹선형으로 늘여 계단 모양을 줄인다. AI 알파가 있으면 옷 밖은 흰 배경으로 바꿔(가장자리는 알파로 섞어) 저장한다.
function cropPhoto(image:HTMLImageElement,cutout:GarmentCutout,small:number,shoulderToChest:number,alpha:Matte|null):PreparedPhoto{
 const {x0,y0,x1,y1}=cutout.box,margin=.04*Math.max(x1-x0,y1-y0),sw=cutout.width,sh=cutout.height;
 const cx0=Math.max(0,(x0-margin)/small),cy0=Math.max(0,(y0-margin)/small),cx1=Math.min(image.width,(x1+1+margin)/small),cy1=Math.min(image.height,(y1+1+margin)/small);
 const scale=Math.min(1,PHOTO_MAX_SIDE/Math.max(cx1-cx0,cy1-cy0)),width=Math.max(8,Math.round((cx1-cx0)*scale)),height=Math.max(8,Math.round((cy1-cy0)*scale));
 const out=canvas(width,height);out.context.imageSmoothingQuality='high';out.context.drawImage(image,cx0,cy0,cx1-cx0,cy1-cy0,0,0,width,height);
 const mask=new Uint8Array(width*height),maskCanvas=canvas(width,height),maskData=maskCanvas.context.createImageData(width,height);
 const photo=alpha?out.context.getImageData(0,0,width,height):null;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const ix=cx0+(x+.5)/scale,iy=cy0+(y+.5)/scale,on=sample(cutout.mask,sw,sh,ix*small-.5,iy*small-.5)>=.5?1:0,i=y*width+x;
  mask[i]=on;maskData.data[i*4]=maskData.data[i*4+1]=maskData.data[i*4+2]=on?255:0;maskData.data[i*4+3]=255;
  // 옷 밖인데 AI 알파가 절반 이상인 곳은 정리 단계에서 뺀 물체(옷걸이·발·끈)라 흰색으로 지우고, 절반 미만인 가장자리만 알파로 섞는다.
  if(photo&&alpha&&!on){const a=sample(alpha.alpha,alpha.width,alpha.height,ix/image.width*alpha.width-.5,iy/image.height*alpha.height-.5)/255,keep=a<.5?a:0;for(let c=0;c<3;c++)photo.data[i*4+c]=photo.data[i*4+c]*keep+255*(1-keep);}
 }
 if(photo)out.context.putImageData(photo,0,0);
 maskCanvas.context.putImageData(maskData,0,0);
 const scaled=cutoutFromMask(mask,width,height);if(!scaled)return failed('옷 윤곽을 찾지 못했어요');
 const top=analyzeTopLayout(scaled,shoulderToChest),bottom=analyzeBottomLayout(scaled);
 let quality=.86,imageUrl=out.c.toDataURL('image/jpeg',quality);
 while(imageUrl.length>PHOTO_LIMITS.imageChars&&quality>.5){quality-=.08;imageUrl=out.c.toDataURL('image/jpeg',quality);}
 const maskUrl=maskCanvas.c.toDataURL('image/png');
 if(imageUrl.length>PHOTO_LIMITS.imageChars||maskUrl.length>PHOTO_LIMITS.maskChars)return failed('사진 파일이 너무 커요');
 return {photo:{image:imageUrl,mask:maskUrl},reason:'',top:top.layout?null:top.reason,bottom:bottom.layout?null:bottom.reason};
}
