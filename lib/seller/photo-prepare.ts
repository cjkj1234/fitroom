// 판매자가 고른 평면 촬영 사진을 상품 사진(옷 둘레로 자른 JPEG + 흑백 옷 마스크 PNG)으로 만들고,
// 3D 옷에 입힐 수 있는지(몸판·소매·가랑이를 찾는지) 미리 확인한다. 브라우저 전용(canvas).
import {cutOutGarment} from './photo-texture';
import {PHOTO_LIMITS,PHOTO_MAX_SIDE} from './photo-files';
import {analyzeBottomLayout,analyzeTopLayout,cutoutFromMask} from '../wardrobe/photo-layout';
import type {ProductPhoto} from '../wardrobe/types';

// photo: 저장할 사진(옷을 못 찾았거나 너무 크면 null). top·bottom: 그 사진을 상의·하의 3D에 입힐 수 있는지와 못 하는 이유.
// 카테고리를 사진을 고른 뒤에 바꿀 수 있어 둘 다 확인해 둔다.
export type PreparedPhoto={photo:ProductPhoto|null;reason:string;top:string|null;bottom:string|null};
const failed=(reason:string):PreparedPhoto=>({photo:null,reason,top:reason,bottom:reason});

// 사진에서 옷을 찾고 둘레에 4% 여백을 두고 자른 뒤, 긴 변을 PHOTO_MAX_SIDE 이하로 줄인다. 옷 찾기는 긴 변 420px로 줄인 사진에서 한다(판매자 화면의 다른 분석과 같은 크기).
// top·bottom은 문제가 없으면 null, 있으면 이유다.
export async function prepareProductPhoto(source:string,shoulderToChest=.92):Promise<PreparedPhoto>{
 const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('사진을 읽지 못했어요'));img.src=source;});
 const canvas=(width:number,height:number)=>{const c=document.createElement('canvas');c.width=width;c.height=height;const context=c.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('canvas');return {c,context};};
 const small=Math.min(1,420/Math.max(image.width,image.height)),sw=Math.max(2,Math.round(image.width*small)),sh=Math.max(2,Math.round(image.height*small));
 const probe=canvas(sw,sh);probe.context.drawImage(image,0,0,sw,sh);
 const cutout=cutOutGarment(probe.context.getImageData(0,0,sw,sh).data,sw,sh);
 if(!cutout)return failed('옷 윤곽을 찾지 못했어요');
 // 자를 영역(원본 픽셀).
 const {x0,y0,x1,y1}=cutout.box,margin=.04*Math.max(x1-x0,y1-y0);
 const cx0=Math.max(0,(x0-margin)/small),cy0=Math.max(0,(y0-margin)/small),cx1=Math.min(image.width,(x1+1+margin)/small),cy1=Math.min(image.height,(y1+1+margin)/small);
 const scale=Math.min(1,PHOTO_MAX_SIDE/Math.max(cx1-cx0,cy1-cy0)),width=Math.max(8,Math.round((cx1-cx0)*scale)),height=Math.max(8,Math.round((cy1-cy0)*scale));
 const out=canvas(width,height);out.context.imageSmoothingQuality='high';out.context.drawImage(image,cx0,cy0,cx1-cx0,cy1-cy0,0,0,width,height);
 // 마스크: 작은 사진의 옷 마스크를 자른 영역 크기로 옮긴다(가장 가까운 픽셀).
 const mask=new Uint8Array(width*height),maskCanvas=canvas(width,height),maskData=maskCanvas.context.createImageData(width,height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sx=Math.min(sw-1,Math.floor((cx0+(x+.5)/scale)*small)),sy=Math.min(sh-1,Math.floor((cy0+(y+.5)/scale)*small)),on=cutout.mask[sy*sw+sx]?1:0,i=y*width+x;
  mask[i]=on;maskData.data[i*4]=maskData.data[i*4+1]=maskData.data[i*4+2]=on?255:0;maskData.data[i*4+3]=255;
 }
 maskCanvas.context.putImageData(maskData,0,0);
 const scaled=cutoutFromMask(mask,width,height);if(!scaled)return failed('옷 윤곽을 찾지 못했어요');
 const top=analyzeTopLayout(scaled,shoulderToChest),bottom=analyzeBottomLayout(scaled);
 let quality=.86,imageUrl=out.c.toDataURL('image/jpeg',quality);
 while(imageUrl.length>PHOTO_LIMITS.imageChars&&quality>.5){quality-=.08;imageUrl=out.c.toDataURL('image/jpeg',quality);}
 const maskUrl=maskCanvas.c.toDataURL('image/png');
 if(imageUrl.length>PHOTO_LIMITS.imageChars||maskUrl.length>PHOTO_LIMITS.maskChars)return failed('사진 파일이 너무 커요');
 return {photo:{image:imageUrl,mask:maskUrl},reason:'',top:top.layout?null:top.reason,bottom:bottom.layout?null:bottom.reason};
}
