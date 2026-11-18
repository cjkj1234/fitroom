import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DEFAULT_BODY} from './body';
import {PRODUCTS} from './catalog';
import {disposeGroup,makeGarment,type GarmentPhoto} from './geometry';
import {analyzeBottomLayout,analyzeTopLayout,type PhotoLayout} from './photo-layout';
import {pantsPhoto,teePhoto} from './flat-lay.fixture';
import type {Product} from './types';

const tee=PRODUCTS.find(p=>p.id==='6170660')!,shirt:Product={...tee,id:'shirt',style:'shirt'},pants=PRODUCTS.find(p=>p.id==='3547134')!;
const photoOf=(layout:PhotoLayout):GarmentPhoto=>({front:{layout,texture:new THREE.Texture()},back:{layout,texture:new THREE.Texture()},color:'#808080'});
const topLayout=analyzeTopLayout(teePhoto().cutout).layout!,bottomLayout=analyzeBottomLayout(pantsPhoto().cutout).layout!;
const meshes=(group:THREE.Group)=>{const out:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)out.push(o);});return out;};
const size=(p:Product)=>p.sizes.find(s=>s.label===p.defaultSize)!;

test('사진을 입힌 상의·하의: 몸판·소매·다리에 앞(uv1)·뒤(uv2) 사진 좌표가 있고 삼각형이 앞·뒤 묶음으로 빠짐없이 나뉜다',()=>{
 for(const [product,layout,names] of [[tee,topLayout,['top-body','sleeve','top-hem','cuff']],[pants,bottomLayout,['bottom-body','bottom-hem','bottom-waistband']]] as const){
  const group=makeGarment(product,size(product),DEFAULT_BODY,false,{photo:photoOf(layout),fine:true});
  for(const name of names){
   const found=meshes(group).filter(m=>m.name===name);assert.ok(found.length,`${product.name} ${name}`);
   for(const mesh of found){
    const g=mesh.geometry,uv1=g.getAttribute('uv1'),uv2=g.getAttribute('uv2');
    assert.ok(uv1&&uv2,`${name} 사진 좌표`);
    assert.ok(Array.from(uv1.array as ArrayLike<number>).concat(Array.from(uv2.array as ArrayLike<number>)).every(v=>Number.isFinite(v)&&v>=0&&v<=1),`${name} 좌표 범위`);
    assert.equal(g.groups.length,2);assert.equal(g.groups[0].count+g.groups[1].count,g.getIndex()!.count);
    assert.ok(Array.isArray(mesh.material)&&mesh.material.every(m=>(m as THREE.MeshPhysicalMaterial).map),`${name} 사진 재질`);
   }
  }
  disposeGroup(group);
 }
});

test('천 시뮬레이션 Worker가 만드는 조각 구성({photo:{}})은 사진을 입힌 화면 쪽과 같고, 사진에 보이는 절차형 세부는 만들지 않는다',()=>{
 for(const product of [tee,shirt,pants,{...pants,id:'cargo',style:'carpenter' as const}]){
  const shown=makeGarment(product,size(product),DEFAULT_BODY,false,{photo:photoOf(product.slot==='top'?topLayout:bottomLayout),fine:true});
  const worker=makeGarment(product,size(product),DEFAULT_BODY,false,{photo:{},fine:true}),plain=makeGarment(product,size(product),DEFAULT_BODY,false,{fine:true});
  assert.deepEqual(meshes(shown).map(m=>m.geometry.getAttribute('position').count),meshes(worker).map(m=>m.geometry.getAttribute('position').count),product.id);
  if(product.silhouette==='stripe'||product.style)assert.ok(meshes(shown).length<meshes(plain).length,`${product.id}: 줄무늬·단추·주머니는 사진으로`);
  [shown,worker,plain].forEach(disposeGroup);
 }
});

test('상의 사진 좌표: 가슴 앞 가운데는 사진 가운데, +x 옆선은 앞 사진 오른쪽·뒤 사진 왼쪽, 소매는 사진 소매 쪽',()=>{
 const group=makeGarment(tee,size(tee),DEFAULT_BODY,false,{photo:photoOf(topLayout)}),body=group.getObjectByName('top-body') as THREE.Mesh;
 const g=body.geometry,position=g.getAttribute('position'),uv1=g.getAttribute('uv1'),uv2=g.getAttribute('uv2');
 let chestY=0;for(let i=0;i<position.count;i++)chestY+=position.getY(i);chestY/=position.count;
 // 몸판 평균 높이 근처 고리에서 가장 앞(z 최대)·가장 +x인 정점.
 let front=-1,side=-1;
 for(let i=0;i<position.count;i++){if(Math.abs(position.getY(i)-chestY)>.02)continue;if(front<0||position.getZ(i)>position.getZ(front))front=i;if(side<0||position.getX(i)>position.getX(side))side=i;}
 const px=(attribute:THREE.BufferAttribute|THREE.InterleavedBufferAttribute,i:number)=>attribute.getX(i)*400-.5;
 assert.ok(Math.abs(px(uv1,front)-200)<6,`앞 가운데 ${px(uv1,front)}`);
 assert.ok(Math.abs(px(uv1,side)-280)<8,`+x 옆선(앞 사진) ${px(uv1,side)}`);
 assert.ok(Math.abs(px(uv2,side)-120)<8,`+x 옆선(뒤 사진) ${px(uv2,side)}`);
 // 착용자 왼쪽(+x) 소매의 앞을 보는 정점은 앞 사진의 오른쪽 소매(몸판 280px 바깥)를 쓴다.
 const sleeves=meshes(group).filter(m=>m.name==='sleeve');
 const left=sleeves.find(m=>m.geometry.getAttribute('position').getX(0)>0)!,lp=left.geometry.getAttribute('position'),lu=left.geometry.getAttribute('uv1');
 let far=0;for(let i=0;i<lp.count;i++)if(lp.getX(i)>lp.getX(far))far=i;
 assert.ok(px(lu,far)>285,`소매단 ${px(lu,far)}`);
 disposeGroup(group);
});

test('바지 사진 좌표: 착용자 왼쪽(+x) 다리 앞은 앞 사진 오른쪽 다리, 뒤는 뒤 사진 왼쪽 다리',()=>{
 const group=makeGarment(pants,size(pants),DEFAULT_BODY,false,{photo:photoOf(bottomLayout)}),body=group.getObjectByName('bottom-body') as THREE.Mesh;
 const g=body.geometry,position=g.getAttribute('position'),uv1=g.getAttribute('uv1'),uv2=g.getAttribute('uv2');
 let checked=0;
 for(let i=0;i<position.count;i++){
  if(position.getY(i)>.5||position.getX(i)<.05)continue;
  checked++;assert.ok(uv1.getX(i)*400>200,`앞 사진 오른쪽 다리 ${uv1.getX(i)*400}`);assert.ok(uv2.getX(i)*400<200,`뒤 사진 왼쪽 다리 ${uv2.getX(i)*400}`);
 }
 assert.ok(checked>50);
 disposeGroup(group);
});
