import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_APPEARANCE,HAIR_COLORS,HAIR_STYLES,SKIN_TONES,hairColor,parseAppearance,skinColor} from './appearance';

test('stored appearance falls back to defaults field by field',()=>{
 assert.deepEqual(parseAppearance(null),DEFAULT_APPEARANCE);
 assert.deepEqual(parseAppearance('{broken'),DEFAULT_APPEARANCE);
 assert.deepEqual(parseAppearance('"short"'),DEFAULT_APPEARANCE);
 assert.deepEqual(parseAppearance(JSON.stringify({skinTone:'deep',hairStyle:'mohawk',hairColor:'black',photo:'data:image/png;base64,AAAA'})),{version:1,skinTone:'deep',hairStyle:'short',hairColor:'black'});
 for(const tone of SKIN_TONES)for(const style of HAIR_STYLES)for(const color of HAIR_COLORS){
  const value={version:1 as const,skinTone:tone.id,hairStyle:style.id,hairColor:color.id};
  assert.deepEqual(parseAppearance(JSON.stringify(value)),value);
 }
});

test('every skin and hair choice maps to a colour, and skin tones run from light to deep',()=>{
 const luminance=(hex:string)=>{const n=parseInt(hex.slice(1),16);return .2126*(n>>16&255)+.7152*(n>>8&255)+.0722*(n&255);};
 for(const tone of SKIN_TONES)assert.match(skinColor({...DEFAULT_APPEARANCE,skinTone:tone.id}),/^#[0-9a-f]{6}$/);
 for(const color of HAIR_COLORS)assert.match(hairColor({...DEFAULT_APPEARANCE,hairColor:color.id}),/^#[0-9a-f]{6}$/);
 const lum=SKIN_TONES.map(tone=>luminance(tone.color));
 assert.ok(lum.every((v,i)=>i===0||v<lum[i-1]));
});

// public/models/mannequin.glb에 얹은 얼굴 디테일(docs/assets/source/generate_avatar_details.py)이 몸 메시를 건드리지 않았는지 확인한다.
test('the mannequin asset keeps one body mesh and adds eyes and brows that follow its body-shape morphs',()=>{
 const glb=readFileSync(new URL('../../public/models/mannequin.glb',import.meta.url));
 const jsonLength=glb.readUInt32LE(12),json=JSON.parse(glb.subarray(20,20+jsonLength).toString());
 type Mesh={name?:string;extras?:{targetNames?:string[]};primitives:Array<{attributes:Record<string,number>;targets?:unknown[]}>};
 const meshes:Mesh[]=json.meshes,body=meshes[0],prim=body.primitives[0];
 const count=(index:number)=>json.accessors[index].count as number;
 // 몸: 첫 번째 메시, 정점 색(입술·볼·눈두덩)이 정점마다 하나씩.
 assert.equal(body.primitives.length,1);
 assert.equal(count(prim.attributes.COLOR_0),count(prim.attributes.POSITION));
 const names=body.extras!.targetNames!;assert.ok(names.length>0);
 const byName=Object.fromEntries(meshes.map(m=>[m.name,m]));
 const center=(m:Mesh)=>{const a=json.accessors[m.primitives[0].attributes.POSITION];return a.min.map((v:number,i:number)=>(v+a.max[i])/2) as number[];};
 for(const name of ['Eye_L','Eye_R','Brows']){
  const m=byName[name];assert.ok(m,name);
  assert.deepEqual(m.extras?.targetNames,names,`${name} morphs with the body`);
  assert.equal(m.primitives[0].targets?.length,names.length);
 }
 const left=center(byName.Eye_L),right=center(byName.Eye_R),brows=center(byName.Brows);
 assert.ok(Math.abs(left[0]+right[0])<.002,'eyes are mirrored');
 assert.ok(Math.abs(left[1]-right[1])<.001);
 assert.ok(brows[1]>left[1]+.01&&brows[1]<left[1]+.04,'brows sit just above the eyes');
});

// 눈·눈썹 메시를 체형 모프와 함께 움직였을 때 머리 안에 머무는지 본다. 모프 값이 정점 위치만큼 크게 잘못 들어가면
// 체형을 바꾸는 순간 눈이 머리 밖으로 날아가고, 아바타 높이 계산이 그 점까지 포함해 몸 전체가 납작해진다.
test('체형을 바꿔도(모프 가중치 ±1 포함) 눈·눈썹이 얼굴과 함께 움직여 머리 안에 머문다',()=>{
 const glb=readFileSync(new URL('../../public/models/mannequin.glb',import.meta.url));
 const jsonLength=glb.readUInt32LE(12),json=JSON.parse(glb.subarray(20,20+jsonLength).toString()),bin=glb.subarray(20+jsonLength+8);
 const floats=(index:number)=>{const a=json.accessors[index],v=json.bufferViews[a.bufferView],start=(v.byteOffset||0)+(a.byteOffset||0),out=new Float32Array(a.count*3);for(let i=0;i<out.length;i++)out[i]=bin.readFloatLE(start+i*4);return out;};
 type Mesh={name?:string;extras:{targetNames:string[]};primitives:Array<{attributes:{POSITION:number};targets:Array<{POSITION:number}>}>};
 const meshes=(json.meshes as Mesh[]).map(m=>({name:m.name??'',positions:floats(m.primitives[0].attributes.POSITION),targets:Object.fromEntries(m.extras.targetNames.map((n,i)=>[n,floats(m.primitives[0].targets[i].POSITION)]))}));
 const body=meshes[0],face=meshes.filter(m=>/Eye|Brows/.test(m.name));assert.equal(face.length,3);
 const morph=(m:typeof body,weights:Record<string,number>)=>{const out=Float32Array.from(m.positions);for(const [name,w] of Object.entries(weights))if(w)m.targets[name].forEach((d,i)=>{out[i]+=w*d;});return out;};
 const names=Object.keys(body.targets),cases:Array<Record<string,number>>=[{}];
 for(const name of names)for(const w of [-1,1])cases.push({[name]:w});
 cases.push(Object.fromEntries(names.map(n=>[n,.6])),Object.fromEntries(names.map(n=>[n,-.6])));
 for(const weights of cases){
  const b=morph(body,weights);let top=-Infinity;for(let i=1;i<b.length;i+=3)top=Math.max(top,b[i]);
  // 같은 모프를 준 몸의 얼굴 앞쪽 피부 정점(정수리에서 25cm 안).
  const skin:number[]=[];for(let i=0;i<b.length;i+=3)if(b[i+1]>top-.25&&b[i+2]>0)skin.push(b[i],b[i+1],b[i+2]);
  for(const m of face){
   const p=morph(m,weights);let farthest=0;
   for(let i=0;i<p.length;i+=3){
    assert.ok(p[i+1]<top&&p[i+1]>top-.2,`${m.name} ${JSON.stringify(weights)}: 높이 ${p[i+1].toFixed(3)} (정수리 ${top.toFixed(3)})`);
    let near=Infinity;for(let j=0;j<skin.length;j+=3)near=Math.min(near,Math.hypot(p[i]-skin[j],p[i+1]-skin[j+1],p[i+2]-skin[j+2]));
    farthest=Math.max(farthest,near);
   }
   assert.ok(farthest<.025,`${m.name} ${JSON.stringify(weights)}: 얼굴 피부에서 ${(farthest*100).toFixed(1)}cm 떨어짐`);
  }
 }
});
