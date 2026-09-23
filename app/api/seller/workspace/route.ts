import {getChatGPTUser} from '@/app/chatgpt-auth';
import {getD1} from '@/db';
import {parseSellerWorkspaceRow,sellerWorkspacePayloadSchema,sellerWorkspaceSummary,type SellerWorkspaceRow} from '@/lib/seller/workspace';

const MAX_REQUEST_BYTES=262_144;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

function databaseError(error:unknown){
 const message=error instanceof Error?`${error.message}\n${error.cause instanceof Error?error.cause.message:''}`:'';
 if(message.includes('no such table')||message.includes('seller_workspaces'))return json({error:{code:'database_unavailable',message:'서버 저장소를 준비하고 있어요. 잠시 후 다시 시도해 주세요.'}},503);
 return json({error:{code:'database_failed',message:'서버 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'}},500);
}

export async function GET(){
 const user=await getChatGPTUser();
 if(!user)return json({error:{code:'authentication_required',message:'계정 동기화를 사용하려면 ChatGPT 로그인이 필요해요.'}},401);
 try{
  const row=await getD1().prepare('SELECT products_json AS productsJson, store_json AS storeJson, updated_at AS updatedAt FROM seller_workspaces WHERE user_id = ? LIMIT 1').bind(user.userId).first<SellerWorkspaceRow>();
  if(!row)return json({workspace:null,summary:sellerWorkspaceSummary(null)});
  const workspace=parseSellerWorkspaceRow(row);
  if(!workspace)return json({error:{code:'invalid_server_data',message:'저장된 판매자 데이터를 읽지 못했어요. 새로 저장해 주세요.'}},500);
  return json({workspace,summary:sellerWorkspaceSummary(workspace)});
 }catch(error){return databaseError(error);}
}

export async function PUT(request:Request){
 const user=await getChatGPTUser();
 if(!user)return json({error:{code:'authentication_required',message:'계정 동기화를 사용하려면 ChatGPT 로그인이 필요해요.'}},401);
 let body:string;
 try{body=await request.text();}catch{return json({error:{code:'invalid_body',message:'저장할 내용을 읽지 못했어요.'}},400);}
 if(new TextEncoder().encode(body).byteLength>MAX_REQUEST_BYTES)return json({error:{code:'request_too_large',message:'상품 데이터가 너무 커서 저장할 수 없어요.'}},413);
 let raw:unknown;
 try{raw=JSON.parse(body);}catch{return json({error:{code:'invalid_json',message:'저장할 데이터 형식이 올바르지 않아요.'}},400);}
 const parsed=sellerWorkspacePayloadSchema.safeParse(raw);
 if(!parsed.success)return json({error:{code:'invalid_workspace',message:'상품 또는 매장 정보가 올바르지 않아요.'}},400);
 const updatedAt=new Date().toISOString();
 const productsJson=JSON.stringify(parsed.data.products),storeJson=parsed.data.store?JSON.stringify(parsed.data.store):null;
 try{
  await getD1().prepare('INSERT INTO seller_workspaces (user_id, products_json, store_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET products_json = excluded.products_json, store_json = excluded.store_json, updated_at = excluded.updated_at').bind(user.userId,productsJson,storeJson,updatedAt).run();
  const workspace={...parsed.data,updatedAt};
  return json({workspace,summary:sellerWorkspaceSummary(workspace)});
 }catch(error){return databaseError(error);}
}
