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
