import {getChatGPTUser} from '@/app/chatgpt-auth';
import {getD1} from '@/db';
import {photoUploadSchema} from '@/lib/seller/photo-files';
import {parseSellerWorkspaceRow,type SellerWorkspaceRow} from '@/lib/seller/workspace';

// 상품 사진(앞·뒤) 한 벌은 data URL로 최대 약 2.1MB다.
const MAX_REQUEST_BYTES=2_400_000;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const authRequired=()=>json({error:{code:'authentication_required',message:'상품 사진을 서버에 올리려면 ChatGPT 로그인이 필요해요.'}},401);

function databaseError(error:unknown){
 const message=error instanceof Error?`${error.message}\n${error.cause instanceof Error?error.cause.message:''}`:'';
 if(message.includes('no such table'))return json({error:{code:'database_unavailable',message:'서버 저장소를 준비하고 있어요. 잠시 후 다시 시도해 주세요.'}},503);
 return json({error:{code:'database_failed',message:'서버 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'}},500);
}

async function savedProduct(userId:string,productId:string){
 const row=await getD1().prepare('SELECT products_json AS productsJson, store_json AS storeJson, updated_at AS updatedAt FROM seller_workspaces WHERE user_id = ? LIMIT 1').bind(userId).first<SellerWorkspaceRow>();
 return (row&&parseSellerWorkspaceRow(row))?.products.find(product=>product.id===productId)??null;
}

// 상품 사진 올리기. 서버에 저장된 내 상품 정보에 같은 사진 버전(photo.version)이 있어야 받는다(상품 정보를 먼저 동기화).
export async function PUT(request:Request){
 const user=await getChatGPTUser();if(!user)return authRequired();
 let body:string;
 try{body=await request.text();}catch{return json({error:{code:'invalid_body',message:'올릴 사진을 읽지 못했어요.'}},400);}
 if(new TextEncoder().encode(body).byteLength>MAX_REQUEST_BYTES)return json({error:{code:'request_too_large',message:'상품 사진이 너무 커요.'}},413);
 let raw:unknown;
 try{raw=JSON.parse(body);}catch{return json({error:{code:'invalid_json',message:'사진 데이터 형식이 올바르지 않아요.'}},400);}
 const parsed=photoUploadSchema.safeParse(raw);
 if(!parsed.success)return json({error:{code:'invalid_photos',message:'상품 사진 형식이 올바르지 않아요.'}},400);
 const {productId,version,photos}=parsed.data;
 try{
  const product=await savedProduct(user.userId,productId);
  if(!product?.photo||product.photo.version!==version)return json({error:{code:'product_not_synced',message:'상품 정보를 먼저 서버에 저장해 주세요.'}},409);
  if(product.photo.back!==Boolean(photos.back))return json({error:{code:'invalid_photos',message:'상품 정보의 뒷면 사진 여부와 올린 사진이 달라요.'}},400);
  const db=getD1(),now=new Date().toISOString();
  const upsert=(side:'front'|'back',photo:{image:string;mask:string})=>db.prepare('INSERT INTO product_photos (user_id, product_id, side, version, image, mask, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, product_id, side) DO UPDATE SET version = excluded.version, image = excluded.image, mask = excluded.mask, updated_at = excluded.updated_at').bind(user.userId,productId,side,version,photo.image,photo.mask,now);
  await db.batch([upsert('front',photos.front),photos.back?upsert('back',photos.back):db.prepare('DELETE FROM product_photos WHERE user_id = ? AND product_id = ? AND side = ?').bind(user.userId,productId,'back')]);
  return json({productId,version,back:Boolean(photos.back)});
 }catch(error){return databaseError(error);}
}

// 상품 사진 지우기: /api/seller/photos?productId=…
export async function DELETE(request:Request){
 const user=await getChatGPTUser();if(!user)return authRequired();
 const productId=new URL(request.url).searchParams.get('productId')?.trim()??'';
 if(!productId||productId.length>100)return json({error:{code:'invalid_product',message:'상품을 확인해 주세요.'}},400);
 try{await getD1().prepare('DELETE FROM product_photos WHERE user_id = ? AND product_id = ?').bind(user.userId,productId).run();return json({productId,deleted:true});}
 catch(error){return databaseError(error);}
}
