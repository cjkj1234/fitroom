'use client';
import {useEffect,useRef} from 'react';
import {flushSync} from 'react-dom';
import type {BodyProfile,Outfit} from './types';
import {getProduct,PRODUCTS} from './catalog';
export type WearRequest={productId:string;size:string};
export function validateWearRequests(input:unknown):WearRequest[]{
 if(!input||typeof input!=='object'||!Array.isArray((input as {items?:unknown}).items))throw new Error('items 배열이 필요합니다.');
 const items=(input as {items:unknown[]}).items;
 if(items.length<1||items.length>3)throw new Error('한 번에 1~3개의 상품을 입힐 수 있습니다.');
 const slots=new Set<string>();return items.map(item=>{if(!item||typeof item!=='object')throw new Error('상품 정보를 확인하세요.');const i=item as WearRequest,p=getProduct(i.productId);if(!p||!p.sizes.some(s=>s.label===i.size))throw new Error('등록된 상품과 사이즈를 선택하세요.');if(slots.has(p.slot))throw new Error('같은 부위의 상품을 중복 지정할 수 없습니다.');slots.add(p.slot);return {productId:p.id,size:i.size};});
}
type Context={registerTool:(tool:{name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown},options:{signal:AbortSignal})=>void|Promise<void>};
export function useWardrobeTools(state:{body:BodyProfile;outfit:Outfit},onWear:(items:WearRequest[])=>void){
 const current=useRef({state,onWear});current.current={state,onWear};
 useEffect(()=>{const context=(document as Document&{modelContext?:Context}).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();
 const register=(tool:Parameters<Context['registerTool']>[0])=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
 register({name:'get_wardrobe_state',title:'옷장과 착용 상태 확인',description:'등록 상품의 사이즈, 현재 착용 상품과 현재 적용된 체형 치수를 읽습니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({products:PRODUCTS.map(p=>({id:p.id,name:p.name,slot:p.slot,sizes:p.sizes.map(s=>s.label)})),...current.current.state})});
 register({name:'wear_wardrobe_items',title:'선택한 상품 입히기',description:'준비된 옷장에서 1~3개 상품을 아바타에 입힙니다. 해당 부위의 기존 옷을 교체하며 화면에도 바로 반영합니다.',inputSchema:{type:'object',properties:{items:{type:'array',minItems:1,maxItems:3,items:{type:'object',properties:{productId:{type:'string'},size:{type:'string'}},required:['productId','size'],additionalProperties:false}}},required:['items'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{const items=validateWearRequests(input);flushSync(()=>current.current.onWear(items));return {outfit:current.current.state.outfit};}});
 return()=>lifecycle.abort();},[]);
}
