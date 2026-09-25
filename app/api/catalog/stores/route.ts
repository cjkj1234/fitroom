import {getD1} from '@/db';
import {buildPublicSellerStores} from '@/lib/wardrobe/public-catalog';
import type {SellerWorkspaceRow} from '@/lib/seller/workspace';

const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function GET(){
 try{
  const result=await getD1().prepare('SELECT products_json AS productsJson, store_json AS storeJson, updated_at AS updatedAt FROM seller_workspaces ORDER BY updated_at DESC LIMIT 50').all<SellerWorkspaceRow>();
  return json({stores:buildPublicSellerStores(result.results)});
 }catch(error){
  const message=error instanceof Error?`${error.message}\n${error.cause instanceof Error?error.cause.message:''}`:'';
  if(message.includes('no such table')||message.includes('seller_workspaces'))return json({error:{code:'catalog_unavailable',message:'입점 매장 목록을 준비하고 있어요.'}},503);
  return json({error:{code:'catalog_failed',message:'입점 매장 목록을 불러오지 못했어요.'}},500);
 }
}
