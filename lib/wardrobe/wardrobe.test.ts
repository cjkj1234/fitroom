import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PRODUCTS,getProduct} from './catalog';
import {DEFAULT_BODY,BODY_FIELDS,cloneBody,makePreset,parseStoredBody,setMeasurement,validateBody} from './body';
import {estimateFit,wear,remove} from './fit';
import {makeGarment,disposeGroup} from './geometry';
import {ellipseCircumference,estimatePhotoBody,type PhotoEvidence} from './photo-estimate';
import {validateWearRequests} from './webmcp';

test('catalog contains eight small-shop demo products and valid available default sizes',()=>{
 assert.equal(PRODUCTS.length,8);assert.equal(new Set(PRODUCTS.map(p=>p.id)).size,8);
 for(const p of PRODUCTS){assert.equal(p.source,'demo');assert.equal(p.url,'');assert.ok(p.priceKrw&&p.priceKrw>0);assert.ok(p.sizes.some(s=>s.label===p.defaultSize));for(const s of p.sizes)for(const [key,n] of Object.entries(s))if(key!=='label'&&n!==undefined)assert.ok(typeof n==='number'&&n>0);}
 assert.deepEqual(['top','bottom','hat'].map(slot=>PRODUCTS.filter(p=>p.slot===slot).length),[3,3,2]);
});
test('half-width and circumference inputs produce the same chest ease',()=>{
 const p=getProduct('3777371')!,s={label:'test',chestFlat:55};
 assert.equal(estimateFit(DEFAULT_BODY,p,s)[0].value,14);
 assert.equal(estimateFit(DEFAULT_BODY,p,{label:'test',chestCirc:110})[0].value,14);
});
test('negative ease stays negative instead of hiding a small size',()=>{
 const b=setMeasurement(DEFAULT_BODY,'chest',125,'manual');assert.equal(estimateFit(b,PRODUCTS[0],{label:'test',chestFlat:55})[0].value,-15);
});
test('missing measurements, elastic waists, and adjustable caps defer fit judgments',()=>{
 assert.equal(estimateFit(DEFAULT_BODY,PRODUCTS[0],{label:'test'})[0].kind,'unavailable');
 assert.equal(estimateFit(DEFAULT_BODY,getProduct('5196637')!,getProduct('5196637')!.sizes[1])[0].kind,'unavailable');
 assert.equal(estimateFit(DEFAULT_BODY,getProduct('4658117')!,{label:'58',headCirc:58})[0].kind,'unavailable');
});
test('fixed caps can compare head circumference when adjustment is absent',()=>{
 const p={...getProduct('4658117')!,adjustableHat:false};assert.equal(estimateFit(DEFAULT_BODY,p,{label:'58',headCirc:58})[0].value,1);
});
test('wearing or replacing a slot preserves other slots and never mutates prior state',()=>{
 const first=wear({},getProduct('3504218')!,'30'),second=wear(first,PRODUCTS[0],'M'),third=wear(second,getProduct('6170660')!,'L');
 assert.deepEqual(first,{bottom:{productId:'3504218',size:'30'}});assert.deepEqual(third.bottom,first.bottom);assert.equal(third.top?.productId,'6170660');assert.equal(second.top?.productId,'3777371');assert.deepEqual(remove(third,'top'),first);
});
test('unknown size is rejected without state changes',()=>{const old={};assert.throws(()=>wear(old,PRODUCTS[0],'FAKE'));assert.deepEqual(old,{});});
test('typed body values and source labels are validated',()=>{
 assert.ok(validateBody(DEFAULT_BODY));assert.equal(validateBody(setMeasurement(DEFAULT_BODY,'height',NaN,'manual')),false);assert.equal(validateBody(setMeasurement(DEFAULT_BODY,'height',20,'manual')),false);assert.equal(validateBody(setMeasurement(DEFAULT_BODY,'legLength',134,'manual')),false);
});
test('presets stay valid and their inputs are labelled as estimates',()=>{for(const h of [140,175,210])for(const shape of ['slim','regular','broad'] as const){const b=makePreset(h,shape);assert.ok(validateBody(b));assert.equal(b.measurements.height,h);assert.ok(Object.values(b.sources).every(s=>s==='simple'));}});
test('storage round trip preserves measurements; corrupt data is ignored',()=>{
 const b=setMeasurement(DEFAULT_BODY,'waist',85,'manual');assert.deepEqual(parseStoredBody(JSON.stringify(b)),b);assert.equal(parseStoredBody('not-json'),null);assert.equal(parseStoredBody('{"version":3}'),null);
});
test('storage hydration strips unrecognized fields, including photo payloads',()=>{
 const b={...cloneBody(DEFAULT_BODY),photo:'secret',measurements:{...DEFAULT_BODY.measurements,photo:'secret'}};
 assert.equal(JSON.stringify(parseStoredBody(JSON.stringify(b))).includes('secret'),false);
});
test('garment size stays the product size: only where a larger body would poke through is the 3D shell pushed out',()=>{
 const p=PRODUCTS[0],size=p.sizes[1];
 const base=makeGarment(p,size,DEFAULT_BODY),big=makeGarment(p,size,setMeasurement(DEFAULT_BODY,'chest',140,'manual'));
 // 소매는 진동 위치와 길이가 체형에 따라 달라지므로 몸판 조각의 폭으로 비교한다.
 const width=(g:THREE.Group)=>new THREE.Box3().setFromObject(g.getObjectByName('top-body')!).getSize(new THREE.Vector3()).x;
 assert.ok(width(big)>width(base),'몸이 옷보다 크면 그 높이의 옷 껍질을 몸 바깥으로 민다');
 // 핏 보기의 여유는 옷 실측 둘레에서 3D 몸 둘레를 뺀 값이라 가슴이 44cm 커지면 그만큼 줄어든다(모프 가중치 0.88).
 const gain=base.userData.fitEase.chest-big.userData.fitEase.chest;
 assert.ok(Math.abs(gain-44)<3,`가슴 여유 감소 ${gain}cm`);
 // 숫자 핏 카드는 3D 껍질과 무관하게 상품 실측과 입력 치수로만 계산한다.
 assert.deepEqual(estimateFit(DEFAULT_BODY,p,size).map(item=>item.label),estimateFit(setMeasurement(DEFAULT_BODY,'chest',140,'manual'),p,size).map(item=>item.label));
 disposeGroup(base);disposeGroup(big);
});
test('fit view paints tight rings red, roomy rings green or blue, and leaves uncertain parts grey',()=>{
 const tee=PRODUCTS.find(item=>item.slot==='top')!;
 const chestColor=(chestFlat:number)=>{
  const g=makeGarment(tee,{...tee.sizes[0],chestFlat},DEFAULT_BODY,false,{fitView:true}),mesh=g.children[0] as THREE.Mesh;
  const position=mesh.geometry.getAttribute('position'),color=mesh.geometry.getAttribute('color');
  let best=0;for(let i=0;i<position.count;i++)if(Math.abs(position.getY(i)-1.3)<Math.abs(position.getY(best)-1.3))best=i;
  const out={r:color.getX(best),g:color.getY(best),b:color.getZ(best),ease:g.userData.fitEase.chest as number};disposeGroup(g);return out;
 };
 const tight=chestColor(40),roomy=chestColor(66);
 assert.ok(tight.ease<0&&tight.r>tight.g&&tight.r>tight.b,`작은 옷은 빨강 (${JSON.stringify(tight)})`);
 assert.ok(roomy.ease>12&&roomy.b>roomy.r,`큰 옷은 파랑 쪽 (${JSON.stringify(roomy)})`);
 const plain=makeGarment(tee,tee.sizes[0],DEFAULT_BODY),mesh=plain.children[0] as THREE.Mesh;
 assert.equal(mesh.geometry.getAttribute('color'),undefined,'핏 보기를 끄면 정점 색이 없다');disposeGroup(plain);
 const cap=PRODUCTS.find(item=>item.slot==='hat'&&item.adjustableHat);
 if(cap){const g=makeGarment(cap,cap.sizes[0],DEFAULT_BODY,false,{fitView:true});assert.equal(g.userData.fitEase.head,undefined,'조절형 모자는 판단 보류');disposeGroup(g);}
});
test('each garment group is named after its product so a 3D click can identify it',()=>{
 for(const p of PRODUCTS){const g=makeGarment(p,p.sizes[0],DEFAULT_BODY);assert.equal(g.name,p.id);disposeGroup(g);}
});
test('garments include trim details beyond the main body mesh',()=>{
 const count=(slot:string)=>{const p=PRODUCTS.find(item=>item.slot===slot)!,g=makeGarment(p,p.sizes[0],DEFAULT_BODY);let meshes=0;g.traverse(o=>{if(o instanceof THREE.Mesh)meshes++;});disposeGroup(g);return meshes;};
 assert.ok(count('top')>=7,'top: body, hem, collar, sleeves with cuffs');
 // 소매는 진동 둘레에서 바로 이어지는 곡면이라 어깨 위에 따로 얹는 공 모양 캡이 없다.
 const tee=PRODUCTS.find(item=>item.slot==='top')!,g=makeGarment(tee,tee.sizes[0],DEFAULT_BODY),meshes:THREE.Mesh[]=[];g.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
 assert.equal(meshes.filter(m=>m.name==='sleeve').length,2,'양쪽 소매');
 assert.equal(meshes.filter(m=>m.geometry instanceof THREE.SphereGeometry).length,0,'어깨 캡 없음');disposeGroup(g);
 assert.ok(count('bottom')>=10,'bottom: one-piece trousers (seat and legs), hems, waistband, belt loops, fly');
 assert.ok(count('hat')>=10,'hat: crown, seams, button, band, brim and rim');
});
test('all garment variants generate finite geometry',()=>{for(const p of PRODUCTS)for(const s of p.sizes){const g=makeGarment(p,s,DEFAULT_BODY);g.traverse(o=>{if(o instanceof THREE.Mesh)assert.ok(Array.from(o.geometry.getAttribute('position').array).every(Number.isFinite));});disposeGroup(g);}});

function evidence(side=false):PhotoEvidence{
 const width=240,height=400,mask=new Float32Array(width*height);const pts=Array.from({length:33},()=>({x:.5,y:.3,visibility:1}));
 // Geometric fixture with known scale; this tests postprocessing, not learned model accuracy.
 for(let y=20;y<=379;y++){const w=y<75?30:y<230?(side?42:65):y<275?(side?45:69):35;for(let x=120-Math.floor(w/2);x<120+Math.ceil(w/2);x++)mask[y*width+x]=1;}
 pts[0]={x:.5,y:.09,visibility:1};pts[11]={x:side?.48:.30,y:.25,visibility:1};pts[12]={x:side?.52:.70,y:.25,visibility:1};pts[23]={x:.43,y:.65,visibility:1};pts[24]={x:.57,y:.65,visibility:1};pts[27]={x:.46,y:.90,visibility:1};pts[28]={x:.54,y:.90,visibility:1};pts[13]={x:.24,y:.41,visibility:1};pts[14]={x:.76,y:.41,visibility:1};pts[15]={x:.19,y:.56,visibility:1};pts[16]={x:.81,y:.56,visibility:1};return {width,height,mask,points:pts,people:1};
}
test('ellipse approximation returns circle perimeter for equal axes',()=>assert.ok(Math.abs(ellipseCircumference(10,10)-10*Math.PI)<1e-8));
test('photo estimates use the supplied height and preserve explicit measurements',()=>{
 const b=setMeasurement(DEFAULT_BODY,'chest',100,'manual');const r=estimatePhotoBody(evidence(),evidence(true),175,b);assert.equal(r.body.measurements.height,175);assert.equal(r.body.measurements.chest,100);assert.ok(r.preserved.includes('chest'));assert.equal(r.body.sources.waist,'photo');assert.ok(validateBody(r.body));assert.equal(r.body.sources.head,'simple');
});
test('photo processing rejects multiple people, cropped images and wrong orientations',()=>{
 assert.throws(()=>estimatePhotoBody({...evidence(),people:2},evidence(true),175,DEFAULT_BODY));
 const cropped=evidence();cropped.mask[120]=1;assert.throws(()=>estimatePhotoBody(cropped,evidence(true),175,DEFAULT_BODY));
 assert.throws(()=>estimatePhotoBody(evidence(true),evidence(),175,DEFAULT_BODY));
});
test('photo input must be finite and within the supported height range',()=>assert.throws(()=>estimatePhotoBody(evidence(),evidence(true),NaN,DEFAULT_BODY)));
test('WebMCP rejects invalid batches atomically',()=>{
 assert.deepEqual(validateWearRequests({items:[{productId:'3777371',size:'M'}]}),[{productId:'3777371',size:'M'}]);
 assert.throws(()=>validateWearRequests({items:[{productId:'3777371',size:'M'},{productId:'6170660',size:'M'}]}));assert.throws(()=>validateWearRequests({items:[{productId:'3777371',size:'missing'}]}));
});
