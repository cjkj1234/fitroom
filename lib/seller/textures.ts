// 상품 사진에서 만든 앞면 텍스처는 이 브라우저 탭의 sessionStorage에만 둔다. 탭을 닫으면 사라지고 서버·계정 동기화·localStorage에는 들어가지 않는다.
export const SELLER_TEXTURE_SESSION_KEY='fitroom.seller.textures.v1';
const MAX_TEXTURE_CHARS=160_000;
const DATA_URL=/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/;

export type SellerTextureMap=Record<string,string>;

export function parseTextureMap(raw:string|null):SellerTextureMap{
 if(!raw)return {};
 try{
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const result:SellerTextureMap={};
  for(const [id,url] of Object.entries(value as Record<string,unknown>)){
   if(typeof url==='string'&&url.length<=MAX_TEXTURE_CHARS&&DATA_URL.test(url)&&id.length<=100)result[id]=url;
  }
  return result;
 }catch{return {};}
}

export function withTexture(map:SellerTextureMap,productId:string,dataUrl:string|null):SellerTextureMap{
 const next={...map};
 if(dataUrl&&dataUrl.length<=MAX_TEXTURE_CHARS&&DATA_URL.test(dataUrl))next[productId]=dataUrl;else delete next[productId];
 return next;
}

export function readSessionTextures():SellerTextureMap{
 try{return parseTextureMap(sessionStorage.getItem(SELLER_TEXTURE_SESSION_KEY));}catch{return {};}
}

export function writeSessionTexture(productId:string,dataUrl:string|null){
 try{sessionStorage.setItem(SELLER_TEXTURE_SESSION_KEY,JSON.stringify(withTexture(readSessionTextures(),productId,dataUrl)));return true;}catch{return false;}
}
