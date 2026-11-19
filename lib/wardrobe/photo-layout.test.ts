import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeBottomLayout,analyzeTopLayout,bleedBackground,legPoint,measureFrontNeck,seatPoint,sleevePoint,synthesizeBack,torsoPoint,type BottomLayout,type TopLayout} from './photo-layout';
import {BACKGROUND,flatLay,pantsPhoto as pants,teePhoto as tee,type Point} from './flat-lay.fixture';

const BG=[...BACKGROUND];
const near=(a:number,b:number,tolerance:number,label:string)=>assert.ok(Math.abs(a-b)<=tolerance,`${label}: ${a.toFixed(1)} ≠ ${b} ±${tolerance}`);

test('상의 사진에서 몸판 끝, 겨드랑이, 양쪽 소매 네 모서리를 잰다',()=>{
 const {layout,reason}=analyzeTopLayout(tee().cutout,152/160);assert.ok(layout,reason);
 near(layout.armpit,112,4,'겨드랑이');
 // 가슴 아래 몸판은 120~280px 그대로.
 const chest=layout.torso[Math.round((150-40)/240*63)];near(chest[0],120,3,'몸판 왼쪽');near(chest[1],280,3,'몸판 오른쪽');
 const [left,right]=layout.sleeves;assert.ok(left&&right,'두 소매');
 // 오른쪽 소매: 어깨점은 몸판 위끝 오른쪽, 소매단은 몸판보다 바깥(오른쪽)·어깨보다 아래.
 // 소매 다각형의 소매단 모서리는 (342,80)·(329,134).
 near(right.shoulder[0],276,2,'어깨점 x');
 near(right.cuffTop[0],342,5,'소매단 위 x');near(right.cuffTop[1],80,5,'소매단 위 y');
 near(right.cuffBottom[0],329,5,'소매단 아래 x');near(right.cuffBottom[1],134,5,'소매단 아래 y');
 // 좌우 대칭.
 near(left.cuffTop[0],400-right.cuffTop[0],4,'소매단 대칭');near(left.cuffTop[1],right.cuffTop[1],4,'소매단 높이 대칭');
});

test('상의 3D 점을 사진으로 옮긴다: 앞은 착용자 왼쪽(+x)이 사진 오른쪽, 뒤는 사진 왼쪽',()=>{
 const layout=analyzeTopLayout(tee().cutout).layout as TopLayout,t=(160-40)/240;
 near(torsoPoint(layout,'front',t,Math.PI/2)[0],200,3,'앞 가운데');
 near(torsoPoint(layout,'front',t,0)[0],280,3,'앞 +x 옆선');
 near(torsoPoint(layout,'front',t,Math.PI)[0],120,3,'앞 -x 옆선');
 near(torsoPoint(layout,'back',t,Math.PI)[0],280,3,'뒤 -x 옆선');
 near(torsoPoint(layout,'back',t,1.5*Math.PI)[0],200,3,'뒤 가운데');
 near(torsoPoint(layout,'front',t,Math.PI/2)[1],160,1,'높이');
 // 뒤쪽 점을 앞 사진으로 옮기면 가까운 옆선에 붙는다.
 near(torsoPoint(layout,'front',t,1.9*Math.PI)[0],280,3,'뒤쪽 +x 점의 앞 사진 위치');
 // 착용자 왼쪽 소매는 앞 사진의 오른쪽 소매, 뒤 사진의 왼쪽 소매.
 assert.ok(sleevePoint(layout,'front',1,.8,.5)[0]>300);
 assert.ok(sleevePoint(layout,'back',1,.8,.5)[0]<100);
 assert.ok(sleevePoint(layout,'front',-1,.8,.5)[0]<100);
});

test('바지 사진에서 가랑이와 두 다리 폭을 재고, 다리 바깥·안쪽 솔기를 사진 끝에 맞춘다',()=>{
 const {layout,reason}=analyzeBottomLayout(pants().cutout);assert.ok(layout,reason);
 near(layout.crotch,154,6,'가랑이');
 const hem=layout.legs[layout.legs.length-1];near(hem[0][0],138,4,'왼다리 바깥');near(hem[1][1],262,4,'오른다리 바깥');
 const l=layout as BottomLayout;
 // 앞: 착용자 왼쪽(+x) 다리는 사진 오른쪽 다리, 바깥 옆선(θ=0)이 오른쪽 끝, 안쪽 솔기(θ=π)가 왼쪽 끝.
 near(legPoint(l,'front',1,1,0)[0],262,4,'앞 +x 다리 바깥');near(legPoint(l,'front',1,1,Math.PI)[0],212,4,'앞 +x 다리 안쪽');
 near(legPoint(l,'front',-1,1,0)[0],138,4,'앞 -x 다리 바깥');
 // 뒤: 착용자 왼쪽 다리는 사진 왼쪽 다리, 바깥 옆선이 왼쪽 끝.
 near(legPoint(l,'back',1,1,-.01)[0],138,4,'뒤 +x 다리 바깥');near(legPoint(l,'back',-1,1,-.01)[0],262,4,'뒤 -x 다리 바깥');
 near(seatPoint(l,'front',0,Math.PI/2)[0],200,3,'허리 앞 가운데');
});

test('배경을 옷 색으로 번지게 채우고, 뒤 사진이 없으면 가운데 프린트 없이 줄무늬만 옮긴 뒤판을 만든다',()=>{
 // 흰 바탕에 남색 가로 줄무늬(20px마다 6px), 가슴 가운데 빨간 프린트.
 const paint=(x:number,y:number):[number,number,number]=>Math.abs(x-200)<25&&y>130&&y<170?[200,30,30]:(y%20)<6?[40,50,90]:[222,222,214];
 const {pixels,cutout}=tee(paint),layout=analyzeTopLayout(cutout).layout as TopLayout;
 const bled=Uint8ClampedArray.from(pixels);bleedBackground(bled,cutout.mask,cutout.width,cutout.height);
 // 몸판 바로 바깥 배경(오른쪽 옆선 밖, 밑단 근처)은 이제 옷 색(흰 줄 또는 남색)이다.
 const at=(data:Uint8ClampedArray,x:number,y:number)=>[data[(y*400+x)*4],data[(y*400+x)*4+1],data[(y*400+x)*4+2]];
 assert.notDeepEqual(at(bled,284,250),BG);
 const back=synthesizeBack(bled,layout);
 let red=0;for(let y=130;y<170;y++)for(let x=175;x<225;x++){const [r,g]=at(back,x,y);if(r>150&&g<80)red++;}
 assert.equal(red,0,'뒤판에 가슴 프린트가 남지 않는다');
 // 줄무늬 높이(y=203: 남색, y=213: 흰색)는 뒤판 가운데에서도 같다.
 assert.ok(at(back,200,203)[2]>at(back,200,203)[0]+20,'남색 줄');assert.ok(at(back,200,213)[0]>200,'흰 줄');
});

test('몸판 폭 가득한 가슴 프린트도 뒤판에 옮기지 않는다(옆선 쪽 원단으로 채운다)',()=>{
 // 검은 티셔츠, y 140~180에 몸판 폭의 85%를 덮는 흰 프린트.
 const paint=(x:number,y:number):[number,number,number]=>Math.abs(x-200)<68&&y>140&&y<180?[235,235,235]:[18,18,18];
 const {pixels,cutout}=tee(paint),layout=analyzeTopLayout(cutout).layout as TopLayout;
 const bled=Uint8ClampedArray.from(pixels);bleedBackground(bled,cutout.mask,cutout.width,cutout.height);
 const back=synthesizeBack(bled,layout);
 let white=0;for(let y=145;y<176;y++)for(let x=125;x<276;x++)if(back[(y*400+x)*4]>150)white++;
 assert.equal(white,0,'뒤판에 흰 프린트 띠가 생기지 않는다');
});

test('앞 사진의 앞 목선(목둘레 안 뒤판 안쪽이 끝나는 깊이)을 재고, 3D 앞 목선을 그 깊이에 맞춘다',()=>{
 // 목 옆 점은 가운데에서 ±22px, 어깨로 갈수록 내려간다. 목둘레 안(가운데 30px 깊이까지)은 어두운 뒤판 안쪽.
 const c=200,top=40,inner=(x:number,y:number)=>Math.abs(x-c)<22&&y<top+30*Math.pow(1-((x-c)/22)**2,.9);
 const body:Point[]=[[c-22,top],[c+22,top],[c+76,top+8],[c+80,112],[c+80,280],[c-80,280],[c-80,112],[c-76,top+8]];
 const sleeve=(side:1|-1):Point[]=>[[c+side*72,top+9],[c+side*142,top+42],[c+side*129,134],[c+side*78,112]];
 const {pixels,cutout}=flatLay(400,320,[body,sleeve(1),sleeve(-1)],(x,y)=>inner(x,y)?[60,62,70]:[150,120,90]);
 const layout=analyzeTopLayout(cutout).layout!;
 const neck=measureFrontNeck(pixels,cutout.mask,layout);assert.ok(neck,'앞 목선');
 near(neck.depth,30,4,'목선 깊이');near(neck.half,22,5,'목 반폭');near(neck.cx,200,3,'목 가운데');
 layout.neck=neck;
 // 3D 앞 가운데 목선(위끝에서 길이의 5% 아래)은 사진 목선 높이로, 밑단은 그대로 밑단으로 간다.
 near(torsoPoint(layout,'front',.05,Math.PI/2,.05)[1],70,4,'목선');
 near(torsoPoint(layout,'front',1,Math.PI/2,.05)[1],280,1,'밑단');
 near(torsoPoint(layout,'back',.05,1.5*Math.PI,.05)[1],52,1,'뒤판은 그대로');
 // 같은 색이면(구분되지 않으면) 재지 않는다.
 const plain=flatLay(400,320,[body,sleeve(1),sleeve(-1)],()=>[150,120,90]);
 assert.equal(measureFrontNeck(plain.pixels,plain.cutout.mask,analyzeTopLayout(plain.cutout).layout!),null);
});
