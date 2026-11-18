// 브라우저에서 상품 사진(앞·뒤 사진과 옷 마스크)을 읽어 3D 옷에 입힐 텍스처와 배치를 만든다.
// 마스크로 배치를 재고(photo-layout.ts), 배경은 옷 색으로 번지게 채우며, 뒤 사진이 없으면 앞 사진으로 뒤판을 만든다.
import * as THREE from 'three';
import {analyzeBottomLayout,analyzeTopLayout,bleedBackground,cutoutFromMask,erodeMask,measureFrontNeck,synthesizeBack,type PhotoLayout} from './photo-layout';
import type {GarmentPhoto} from './geometry';
import type {Product,ProductPhoto} from './types';

function loadImage(src:string){
 return new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.decoding='async';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('사진을 읽지 못했어요'));image.src=src;});
}
function pixelsOf(image:HTMLImageElement,width:number,height:number){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('canvas');
 context.drawImage(image,0,0,width,height);return context.getImageData(0,0,width,height);
}
const hex=([r,g,b]:[number,number,number])=>`#${[r,g,b].map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('')}`;

// 상의 어깨너비 ÷ 가슴단면. 사진에서는 어깨점이 보이지 않아 대표 사이즈 실측으로 정한다.
export function shoulderToChest(product:Product){
 const size=product.sizes.find(s=>s.label===product.defaultSize)??product.sizes[0];
 return size?.shoulder&&size.chestFlat?size.shoulder/size.chestFlat:.92;
}

type Side={layout:PhotoLayout;data:ImageData;color:[number,number,number]};
// front: 앞 사진이면 앞 목선(목둘레 안으로 보이는 뒤판 안쪽의 깊이)도 잰다.
async function readSide(photo:ProductPhoto,product:Product,front=false):Promise<Side|null>{
 const [image,maskImage]=await Promise.all([loadImage(photo.image),loadImage(photo.mask)]);
 const width=image.naturalWidth,height=image.naturalHeight;if(!width||!height)return null;
 const data=pixelsOf(image,width,height),maskData=pixelsOf(maskImage,width,height).data,mask=new Uint8Array(width*height);
 for(let i=0;i<mask.length;i++)mask[i]=maskData[i*4]>127?1:0;
 const cutout=cutoutFromMask(mask,width,height);if(!cutout)return null;
 const layout=product.slot==='top'?analyzeTopLayout(cutout,shoulderToChest(product)).layout:product.slot==='bottom'?analyzeBottomLayout(cutout).layout:null;
 if(!layout)return null;
 if(front&&layout.kind==='top')layout.neck=measureFrontNeck(data.data,mask,layout)??undefined;
 // 옷 가장자리 2px(배경·그림자와 섞인 픽셀)도 안쪽 옷 색으로 채워, 3D 옆선·소매 끝에 밝은 테두리가 찍히지 않게 한다.
 const color=bleedBackground(data.data,erodeMask(mask,width,height,2),width,height);
 return {layout,data,color};
}
function textureOf(data:ImageData){
 const canvas=document.createElement('canvas');canvas.width=data.width;canvas.height=data.height;canvas.getContext('2d')!.putImageData(data,0,0);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

// 상품 사진을 3D용으로 준비한다. 배치를 재지 못하면(옷 윤곽·겨드랑이·가랑이를 못 찾음) null.
export async function loadGarmentPhoto(product:Product):Promise<GarmentPhoto|null>{
 const photos=product.photos;if(!photos||(product.slot!=='top'&&product.slot!=='bottom'))return null;
 const front=await readSide(photos.front,product,true);if(!front)return null;
 const back=photos.back?await readSide(photos.back,product).catch(()=>null):null;
 const backData=back?back.data:new ImageData(synthesizeBack(front.data.data,front.layout),front.data.width,front.data.height);
 return {front:{layout:front.layout,texture:textureOf(front.data)},back:{layout:back?back.layout:front.layout,texture:textureOf(backData)},color:hex(front.color)};
}

// 화면 하나(아바타 보기)가 쓰는 사진 캐시. 처음 요청하면 불러오기 시작하고 끝나면 onReady를 부른다. 그 전에는 undefined.
export function createPhotoCache(onReady:()=>void){
 const ready=new Map<string,GarmentPhoto|null>(),loading=new Set<string>();
 const keyOf=(product:Product)=>product.photos?`${product.id}|${product.photos.front.image.length}:${product.photos.front.image.slice(-40)}|${product.photos.back?.image.slice(-40)??''}`:'';
 return {
  get(product:Product):GarmentPhoto|null|undefined{
   if(!product.photos)return null;
   const key=keyOf(product);if(ready.has(key))return ready.get(key);
   if(!loading.has(key)){loading.add(key);loadGarmentPhoto(product).catch(()=>null).then(photo=>{loading.delete(key);ready.set(key,photo);onReady();});}
   return undefined;
  },
  dispose(){ready.forEach(photo=>{photo?.front?.texture?.dispose();photo?.back?.texture?.dispose();});ready.clear();},
 };
}
