import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cutOutGarment} from './photo-texture';
import {analyzeTopSilhouette,measureTopSilhouette,SILHOUETTE_SAMPLES,type TopSilhouette} from './photo-silhouette';
import {sellerProductSchema} from './products';
import {PRODUCTS} from '../wardrobe/catalog';
import {DEFAULT_BODY} from '../wardrobe/body';
import {makeGarment,disposeGroup} from '../wardrobe/geometry';

type Point=[number,number];
// 흰 배경 위에 다각형(몸판·소매)을 칠한 가짜 평면 촬영 사진. 다각형은 점이 안에 있는지로 채운다.
function flatLay(width:number,height:number,polygons:Point[][]){
 const pixels=new Uint8ClampedArray(width*height*4);
 const inside=(x:number,y:number,poly:Point[])=>{let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;}return hit;};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const garment=polygons.some(poly=>inside(x+.5,y+.5,poly)),i=(y*width+x)*4;
  pixels[i]=garment?96:246;pixels[i+1]=garment?104:246;pixels[i+2]=garment?88:244;pixels[i+3]=255;
 }
 return cutOutGarment(pixels,width,height)!;
}
// 위끝 y0=40, 몸판 가운데 x=200. chest=가슴 평면 폭(px), armpitAt=위끝~겨드랑이(px), length=옷 길이(px), hem=밑단 평면 폭(px).
// 소매는 어깨에서 겨드랑이까지 붙어 바깥 아래로 drop(px)만큼 처져 나간다.
function tee({chest=160,hem=160,armpitAt=72,length=240,reach=70,drop=40}={}){
 const top=40,armpit=top+armpitAt,bottom=top+length,c=200,half=chest/2,shoulder=half*.95;
 const body:Point[]=[[c-shoulder,top],[c+shoulder,top],[c+half,armpit],[c+hem/2,bottom],[c-hem/2,bottom],[c-half,armpit]];
 const sleeve=(side:1|-1):Point[]=>[[c+side*(shoulder-4),top+2],[c+side*(shoulder-4+reach),top+drop],[c+side*(half+reach*.7),armpit+drop*.55],[c+side*(half-2),armpit]];
 return flatLay(400,320,[body,sleeve(1),sleeve(-1)]);
}

test('일자 티셔츠: 겨드랑이 위치와 몸판 폭(가슴 대비 1)을 잰다',()=>{
 const shape=measureTopSilhouette(tee());
 assert.ok(shape,analyzeTopSilhouette(tee()).reason);
 assert.equal(shape.bodyWidths.length,SILHOUETTE_SAMPLES);
 assert.ok(Math.abs(shape.armpit-72/240)<.03,`겨드랑이 ${shape.armpit}`);
 assert.ok(shape.bodyWidths.every(value=>Math.abs(value-1)<.05),`몸판 ${shape.bodyWidths}`);
 assert.ok(Math.abs(shape.lengthToChest-240/160)<.06,`기장/가슴 ${shape.lengthToChest}`);
});

test('밑단이 좁아지는 티셔츠: 밑단 폭 비율이 줄어든다',()=>{
 const shape=measureTopSilhouette(tee({hem:124}))!;
 assert.ok(shape,'측정');
 assert.ok(Math.abs(shape.bodyWidths[SILHOUETTE_SAMPLES-1]-124/160)<.05,`밑단 ${shape.bodyWidths.at(-1)}`);
 assert.ok(shape.bodyWidths[5]<shape.bodyWidths[0]&&shape.bodyWidths[5]>shape.bodyWidths[SILHOUETTE_SAMPLES-1],`가운데 ${shape.bodyWidths[5]}`);
});

test('크롭 티셔츠: 기장 대비 가슴이 넓게(기장 비율이 작게) 잰다',()=>{
 const shape=measureTopSilhouette(tee({length:170,armpitAt:66}))!;
 assert.ok(shape,analyzeTopSilhouette(tee({length:170,armpitAt:66})).reason);
 assert.ok(Math.abs(shape.lengthToChest-170/160)<.06,`기장/가슴 ${shape.lengthToChest}`);
 assert.ok(Math.abs(shape.armpit-66/170)<.04,`겨드랑이 ${shape.armpit}`);
});

test('소매 아랫선이 몸판에 비스듬히 이어진 셔츠도 겨드랑이를 찾는다',()=>{
 // 소매가 거의 수직으로 처져 아랫선이 몸판 옆선과 낮은 각도로 만나는(폭이 한 줄씩 서서히 넓어지는) 박시한 셔츠.
 const shape=measureTopSilhouette(tee({armpitAt:120,reach:46,drop:110,length:260}))!;
 assert.ok(shape,analyzeTopSilhouette(tee({armpitAt:120,reach:46,drop:110,length:260})).reason);
 assert.ok(Math.abs(shape.armpit-120/260)<.05,`겨드랑이 ${shape.armpit}`);
 assert.ok(shape.bodyWidths.every(value=>Math.abs(value-1)<.06),`몸판 ${shape.bodyWidths}`);
});

test('소매가 없는 사각형은 겨드랑이를 찾지 못했다고 이유와 함께 알린다',()=>{
 const result=analyzeTopSilhouette(flatLay(300,300,[[[90,40],[210,40],[210,260],[90,260]]]));
 assert.equal(result.silhouette,null);
 assert.match(result.reason,/겨드랑이/);
});

const shape:TopSilhouette={version:1,bodyWidths:[1,.98,.96,.94,.92,.9,.88,.86,.84,.82,.8],armpit:.36,lengthToChest:1.25};
test('판매자 상품은 사진 실루엣 비율을 저장하고, 범위를 벗어난 값은 거부한다',()=>{
 const now='2026-10-02T00:00:00.000Z';
 const product={version:1,id:'p',storeName:'테스트상점',name:'셔츠',category:'top',color:'카키',features:['오픈카라'],material:null,priceKrw:null,stock:null,purchaseUrl:null,sizes:[],createdAt:now,updatedAt:now,status:'draft',publishedAt:null,photoShape:shape};
 assert.equal(sellerProductSchema.safeParse(product).success,true);
 assert.equal(sellerProductSchema.safeParse({...product,photoShape:{...shape,bodyWidths:shape.bodyWidths.slice(1)}}).success,false,'11개가 아니면 거부');
 assert.equal(sellerProductSchema.safeParse({...product,photoShape:{...shape,armpit:.9}}).success,false,'겨드랑이 범위');
 assert.equal(sellerProductSchema.safeParse({...product,photoShape:null}).success,true);
});

test('사진 실루엣이 있으면 3D 몸판 밑단이 사진 비율대로 좁아지고, 없으면 기존 모양 그대로다',()=>{
 const tee=PRODUCTS.find(item=>item.slot==='top')!,size=tee.sizes[0];
 const halfWidthAt=(group:THREE.Group,y:number)=>{const mesh=group.children[0] as THREE.Mesh,position=mesh.geometry.getAttribute('position');let best=Infinity,width=0;for(let i=0;i<position.count;i++){const d=Math.abs(position.getY(i)-y);if(d<best-1e-6){best=d;width=0;}if(Math.abs(d-best)<1e-6)width=Math.max(width,Math.abs(position.getX(i)));}return width;};
 const plain=makeGarment(tee,size,DEFAULT_BODY),shaped=makeGarment({...tee,photoShape:shape},size,DEFAULT_BODY);
 // 엉덩이 높이(1.12m 아래)는 상의 아래 바지가 비치지 않게 두는 최소 폭이 있어, 그 바로 위 1.14m에서 비교한다.
 const y=1.14;
 assert.ok(halfWidthAt(shaped,y)<halfWidthAt(plain,y)*.97,`1.14m 반폭 ${halfWidthAt(shaped,y)} < ${halfWidthAt(plain,y)}`);
 const again=makeGarment({...tee},size,DEFAULT_BODY);
 assert.equal(halfWidthAt(again,y),halfWidthAt(plain,y),'실루엣이 없으면 같은 모양');
 disposeGroup(plain);disposeGroup(shaped);disposeGroup(again);
});
