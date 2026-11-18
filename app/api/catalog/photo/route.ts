import {getD1} from '@/db';
import {decodeDataUrl,PHOTO_VERSION} from '@/lib/seller/photo-files';
import {publishedSellerProducts} from '@/lib/seller/products';
import {parseSellerWorkspaceRow,type SellerWorkspaceRow} from '@/lib/seller/workspace';

// 이용자 옷장이 쓰는 상품 사진: /api/catalog/photo?product=…&side=front|back&kind=image|mask&v=버전
// 게시 중인 상품이고 상품 정보의 사진 버전과 같을 때만 내려준다. 주소에 버전이 들어가 있어 오래 캐시한다.
const notFound=()=>new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});

export async function GET(request:Request){
 const params=new URL(request.url).searchParams,productId=params.get('product')??'',side=params.get('side'),kind=params.get('kind'),requested=params.get('v')??'';
 if(!productId||productId.length>100||(side!=='front'&&side!=='back')||(kind!=='image'&&kind!=='mask')||(requested&&!PHOTO_VERSION.test(requested)))return notFound();
 try{
  const db=getD1();
  const rows=(await db.prepare('SELECT user_id AS userId, version, image, mask FROM product_photos WHERE product_id = ? AND side = ?').bind(productId,side).all<{userId:string;version:string;image:string;mask:string}>()).results;
  for(const row of rows){
   const owner=await db.prepare('SELECT products_json AS productsJson, store_json AS storeJson, updated_at AS updatedAt FROM seller_workspaces WHERE user_id = ? LIMIT 1').bind(row.userId).first<SellerWorkspaceRow>();
   const product=publishedSellerProducts((owner&&parseSellerWorkspaceRow(owner))?.products??[]).find(item=>item.id===productId);
   if(!product?.photo||product.photo.version!==row.version)continue;
   const decoded=decodeDataUrl(kind==='image'?row.image:row.mask);if(!decoded)continue;
   const exact=requested===row.version;
   return new Response(decoded.bytes,{headers:{'Content-Type':decoded.type,'Cache-Control':exact?'public, max-age=31536000, immutable':'public, max-age=60','X-Content-Type-Options':'nosniff'}});
  }
  return notFound();
 }catch{return notFound();}
}
