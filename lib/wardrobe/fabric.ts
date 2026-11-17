// 원단 결과 머리카락 결을 표현하는 노멀맵. 이미지 파일 없이 수식으로 만든 높이 지도에서 법선을 계산한다.
// DOM이 없는 Node(천 시뮬레이션 Worker·테스트)에서도 만들 수 있게 DataTexture를 쓰고, 종류마다 한 번만 만들어 공유한다.
// 무늬는 실제 원단보다 조금 크게 그린 표현용이며, 멀리서는 밉맵으로 옅어진다.
import * as THREE from 'three';
import type {Product} from './types';

export type FabricKind='knit'|'shirting'|'twill'|'denim';

// 상품 정보로 원단 종류를 고른다. 상의는 셔츠면 평직, 아니면 니트(저지), 하의·모자는 능직, 데님이라고 적힌 상품은 데님.
export function fabricKind(product:Pick<Product,'slot'|'name'|'colorName'|'style'|'note'>):FabricKind{
 const text=`${product.name} ${product.colorName} ${product.note??''}`;
 if(/데님|청바지|denim/i.test(text))return 'denim';
 if(product.slot==='top')return product.style==='shirt'?'shirting':'knit';
 return 'twill';
}

const SIZE=128;
const frac=(x:number)=>x-Math.floor(x);
// 0~1 반복 좌표의 값 잡음(이웃과 부드럽게 이어지는 격자 잡음).
function noise(u:number,v:number,cells:number,seed:number){
 const hash=(i:number,j:number)=>{const s=Math.sin(((i%cells+cells)%cells)*127.1+((j%cells+cells)%cells)*311.7+seed*74.7)*43758.5453;return s-Math.floor(s);};
 const x=u*cells,y=v*cells,i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
 const a=hash(i,j),b=hash(i+1,j),c=hash(i,j+1),d=hash(i+1,j+1);
 return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy;
}

const HEIGHT:Record<FabricKind|'hair',(u:number,v:number)=>number>={
 // 저지: 세로 골(웨일)마다 V자 고리가 위로 이어진다.
 knit:(u,v)=>{const w=frac(u*12),loop=frac(v*16+Math.abs(w-.5)*.9);return .55*(1-Math.abs(2*w-1))+.45*(1-Math.abs(2*loop-1));},
 // 평직 셔츠: 가는 가로·세로 실이 교차한다.
 shirting:(u,v)=>.5+.25*Math.sin(2*Math.PI*u*20)*Math.sin(2*Math.PI*v*20)+.12*(noise(u,v,32,3)-.5),
 // 능직: 사선 골.
 twill:(u,v)=>.5+.5*Math.sin(2*Math.PI*(u+v)*14)+.1*(noise(u,v,32,5)-.5),
 // 데님: 능직에 실 굵기 얼룩.
 denim:(u,v)=>.5+.42*Math.sin(2*Math.PI*(u+v)*14)+.25*(noise(u,v,16,7)-.5)+.12*(noise(u*.5,v*4,8,11)-.5),
 // 머리카락: 세로로 흐르는 가는 결(가로 방향으로만 높이가 바뀐다).
 hair:(u,v)=>.45*noise(u,0,64,13)+.35*noise(u,0,128,17)+.2*noise(u,v*.2,32,19),
};
const STRENGTH:Record<FabricKind|'hair',number>={knit:2.2,shirting:1.6,twill:2.4,denim:2.8,hair:3.2};
const REPEAT:Record<FabricKind|'hair',[number,number]>={knit:[25,18],shirting:[25,18],twill:[25,18],denim:[25,18],hair:[3,1]};

function buildNormalMap(kind:FabricKind|'hair'){
 const height=HEIGHT[kind],strength=STRENGTH[kind],data=new Uint8Array(SIZE*SIZE*4),d=1/SIZE;
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
  const u=x/SIZE,v=y/SIZE;
  const dx=(height(frac(u+d),v)-height(frac(u-d+1),v))*strength,dy=(height(u,frac(v+d))-height(u,frac(v-d+1)))*strength;
  const len=Math.hypot(dx,dy,1),i=(y*SIZE+x)*4;
  data[i]=Math.round((-dx/len*.5+.5)*255);data[i+1]=Math.round((-dy/len*.5+.5)*255);data[i+2]=Math.round((1/len*.5+.5)*255);data[i+3]=255;
 }
 const texture=new THREE.DataTexture(data,SIZE,SIZE,THREE.RGBAFormat,THREE.UnsignedByteType);
 texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(...REPEAT[kind]);
 texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=4;
 texture.needsUpdate=true;
 return texture;
}

const cache=new Map<FabricKind|'hair',THREE.DataTexture>();
// 공유 텍스처이므로 옷을 지울 때(disposeGroup은 재질만 정리) 함께 지우지 않는다.
export function fabricNormalMap(kind:FabricKind|'hair'){
 let texture=cache.get(kind);
 if(!texture){texture=buildNormalMap(kind);cache.set(kind,texture);}
 return texture;
}
