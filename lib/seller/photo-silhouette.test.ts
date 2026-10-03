import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cutOutGarment} from './photo-texture';
import {analyzeBottomSilhouette,analyzeTopSilhouette,LEG_SAMPLES,measureTopSilhouette,SILHOUETTE_SAMPLES,type BottomSilhouette,type TopSilhouette} from './photo-silhouette';
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
 // 엉덩이 높이(1.12m 아래)는 상의 아래 바지가 비치지 않게 두는 최소 폭이 있어, 그 바로 위 1.13m에서 비교한다.
 const y=1.13;
 assert.ok(halfWidthAt(shaped,y)<halfWidthAt(plain,y)*.97,`${y}m 반폭 ${halfWidthAt(shaped,y)} < ${halfWidthAt(plain,y)}`);
 const again=makeGarment({...tee},size,DEFAULT_BODY);
 assert.equal(halfWidthAt(again,y),halfWidthAt(plain,y),'실루엣이 없으면 같은 모양');
 disposeGroup(plain);disposeGroup(shaped);disposeGroup(again);
});

// 평면 바지: 위끝 40, 가운데 x=200. waist=허리 폭, hip=엉덩이 폭(가랑이 위 riseAt*0.6), riseAt=위끝~가랑이(px), length=전체 길이,
// thigh=가랑이에서 다리 한쪽 폭, hem=밑단 다리 한쪽 폭, gap=밑단에서 몸 가운데부터 다리 안쪽 선까지(px). 다리 안쪽 선은 가랑이에서 만난다.
function trousers({waist=150,hip=176,riseAt=90,length=300,thigh=88,hem=88,gap=26}={}){
 const top=40,c=200,crotch=top+riseAt,bottom=top+length,hipY=top+riseAt*.6;
 return flatLay(400,380,[[[c-waist/2,top],[c+waist/2,top],[c+hip/2,hipY],[c+thigh,crotch],[c+gap+hem,bottom],[c+gap,bottom],[c,crotch],[c-gap,bottom],[c-gap-hem,bottom],[c-thigh,crotch],[c-hip/2,hipY]]]);
}

test('곧은 바지: 가랑이 위치·허리 대비 엉덩이·기장 비율을 재고 다리 폭은 내내 허벅지와 같다',()=>{
 const result=analyzeBottomSilhouette(trousers()),shape=result.silhouette!;
 assert.ok(shape,result.reason);
 assert.equal(shape.legWidths.length,LEG_SAMPLES);
 assert.ok(Math.abs(shape.rise-90/300)<.03,`가랑이 ${shape.rise}`);
 assert.ok(Math.abs(shape.hipToWaist-176/150)<.05,`엉덩이/허리 ${shape.hipToWaist}`);
 assert.ok(Math.abs(shape.lengthToWaist-300/150)<.06,`기장/허리 ${shape.lengthToWaist}`);
 assert.ok(shape.legWidths.every(value=>Math.abs(value-1)<.06),`다리 ${shape.legWidths}`);
});

test('테이퍼드·부츠컷·반바지: 다리가 좁아지거나 넓어지는 정도와 짧은 기장을 잰다',()=>{
 const tapered=analyzeBottomSilhouette(trousers({hem:52})).silhouette!,flared=analyzeBottomSilhouette(trousers({hem:112,gap:30})).silhouette!;
 assert.ok(tapered&&flared,'측정');
 assert.ok(Math.abs(tapered.legWidths[LEG_SAMPLES-1]-52/88)<.06,`테이퍼드 밑단 ${tapered.legWidths.at(-1)}`);
 assert.ok(tapered.legWidths.every((value,i,all)=>i===0||value<=all[i-1]+.02),`테이퍼드는 아래로 갈수록 좁다 ${tapered.legWidths}`);
 assert.ok(Math.abs(flared.legWidths[LEG_SAMPLES-1]-112/88)<.07,`부츠컷 밑단 ${flared.legWidths.at(-1)}`);
 const shorts=analyzeBottomSilhouette(trousers({length:150,riseAt:80,gap:20})),short=shorts.silhouette!;
 assert.ok(short,shorts.reason);
 assert.ok(Math.abs(short.lengthToWaist-150/150)<.05&&Math.abs(short.rise-80/150)<.04,`반바지 ${short.lengthToWaist} ${short.rise}`);
});

test('두 다리를 붙여 놓았거나 다리가 없는 모양은 가랑이를 찾지 못했다고 이유와 함께 알린다',()=>{
 const touching=analyzeBottomSilhouette(trousers({gap:0}));
 assert.equal(touching.silhouette,null);assert.match(touching.reason,/가랑이|다리/);
 const skirt=analyzeBottomSilhouette(flatLay(300,300,[[[110,40],[190,40],[230,260],[70,260]]]));
 assert.equal(skirt.silhouette,null);assert.match(skirt.reason,/가랑이/);
});

const legShape:BottomSilhouette={version:1,legWidths:[1,.95,.9,.85,.8,.75,.7,.65,.6],rise:.3,lengthToWaist:2.4,hipToWaist:1.2};
test('판매자 하의는 바지 사진 실루엣 비율을 저장하고, 범위를 벗어난 값은 거부한다',()=>{
 const now='2026-10-03T00:00:00.000Z';
 const product={version:1,id:'p',storeName:'테스트상점',name:'테이퍼드 슬랙스',category:'bottom',color:'차콜',features:['테이퍼드'],material:null,priceKrw:null,stock:null,purchaseUrl:null,sizes:[],createdAt:now,updatedAt:now,status:'draft',publishedAt:null,legShape};
 assert.equal(sellerProductSchema.safeParse(product).success,true);
 assert.equal(sellerProductSchema.safeParse({...product,legShape:{...legShape,legWidths:legShape.legWidths.slice(1)}}).success,false,'9개가 아니면 거부');
 assert.equal(sellerProductSchema.safeParse({...product,legShape:{...legShape,rise:.9}}).success,false,'가랑이 범위');
 assert.equal(sellerProductSchema.safeParse({...product,legShape:null}).success,true);
});

test('바지 사진 실루엣이 있으면 3D 다리가 사진 비율대로 좁아지고, 실측 칸이 비면 사진 비율로 기장·밑위를 정한다',()=>{
 const pants=PRODUCTS.find(item=>item.slot==='bottom'&&item.silhouette==='straight')!,size=pants.sizes.find(item=>item.label===pants.defaultSize)!;
 const legRadiusAt=(group:THREE.Group,y:number)=>{const mesh=group.getObjectByName('bottom-body') as THREE.Mesh,position=mesh.geometry.getAttribute('position');let best=Infinity,low=Infinity,high=-Infinity;for(let i=0;i<position.count;i++){const x=position.getX(i);if(x<=0)continue;const d=Math.abs(position.getY(i)-y);if(d<best-1e-4){best=d;low=x;high=x;}else if(Math.abs(d-best)<1e-4){low=Math.min(low,x);high=Math.max(high,x);}}return (high-low)/2;};
 const straight=makeGarment(pants,size,DEFAULT_BODY),shaped=makeGarment({...pants,legShape},size,DEFAULT_BODY);
 // 무릎 아래(0.3m)에서 사진 실루엣(밑단이 허벅지의 60%)을 쓴 다리가 더 가늘다.
 assert.ok(legRadiusAt(shaped,.3)<legRadiusAt(straight,.3)*.95,`0.3m 다리 반폭 ${legRadiusAt(shaped,.3)} < ${legRadiusAt(straight,.3)}`);
 // 기장·밑위 실측이 없으면 사진 비율(기장 = 허리단면 × 2.4)로 정한다.
 const bare={label:'M',waistFlat:40},noShape=makeGarment(pants,bare,DEFAULT_BODY),fromPhoto=makeGarment({...pants,legShape},bare,DEFAULT_BODY);
 const lowest=(group:THREE.Group)=>new THREE.Box3().setFromObject(group.getObjectByName('bottom-body')!).min.y;
 assert.ok(Math.abs(lowest(fromPhoto)-(DEFAULT_BODY.measurements.legLength-40*2.4)/100)<.01,`사진 기장 밑단 ${lowest(fromPhoto)}`);
 assert.ok(Math.abs(lowest(noShape)-lowest(fromPhoto))>.05,'사진이 없으면 기본 기장(105cm)');
 disposeGroup(straight);disposeGroup(shaped);disposeGroup(noShape);disposeGroup(fromPhoto);
});
