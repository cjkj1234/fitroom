// 판매자 상품 사진(앞·뒤)을 이 브라우저의 IndexedDB에 둔다(localStorage보다 커서 사진 여러 장을 담는다).
// 계정 동기화를 하면 서버(product_photos)에도 올리고, 올린 버전(uploadedVersion)을 기록해 같은 사진을 다시 올리지 않는다.
import {productPhotosSchema} from './photo-files';
import type {ProductPhotos} from '../wardrobe/types';

export type StoredPhotos={productId:string;version:string;photos:ProductPhotos;uploadedVersion:string|null};
// 같은 브라우저의 다른 화면(이용자 옷장)이 사진 변경을 알 수 있게 보내는 이벤트.
export const SELLER_PHOTOS_EVENT='fitroom:seller-photos';
const DB_NAME='fitroom-seller-photos',STORE='photos';

function open():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB 없음'));return;}
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'productId'});};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}
async function run<T>(mode:IDBTransactionMode,body:(store:IDBObjectStore)=>IDBRequest<T>|void):Promise<T|undefined>{
 const db=await open();
 try{
  return await new Promise<T|undefined>((resolve,reject)=>{
   const transaction=db.transaction(STORE,mode),request=body(transaction.objectStore(STORE));let result:T|undefined;
   if(request)request.onsuccess=()=>{result=request.result;};
   transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
  });
 }finally{db.close();}
}
const valid=(value:unknown):value is StoredPhotos=>{
 const entry=value as StoredPhotos;
 return Boolean(entry)&&typeof entry.productId==='string'&&typeof entry.version==='string'&&productPhotosSchema.safeParse(entry.photos).success;
};
const changed=()=>{try{window.dispatchEvent(new Event(SELLER_PHOTOS_EVENT));}catch{}};

export async function readStoredPhotos():Promise<Record<string,StoredPhotos>>{
 try{const all=await run<unknown[]>('readonly',store=>store.getAll());return Object.fromEntries((all??[]).filter(valid).map(entry=>[entry.productId,entry]));}catch{return {};}
}
export async function saveStoredPhotos(productId:string,version:string,photos:ProductPhotos){
 await run('readwrite',store=>{store.put({productId,version,photos,uploadedVersion:null} satisfies StoredPhotos);});changed();
}
export async function deleteStoredPhotos(productId:string){
 try{await run('readwrite',store=>{store.delete(productId);});changed();}catch{}
}
export async function markPhotosUploaded(productId:string,version:string){
 const all=await readStoredPhotos(),entry=all[productId];if(!entry||entry.version!==version)return;
 await run('readwrite',store=>{store.put({...entry,uploadedVersion:version});});
}
