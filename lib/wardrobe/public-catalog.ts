import {z} from 'zod';
import {isReservedStoreName,publishedSellerProducts,sellerProductSchema,type SellerProduct} from '../seller/products';
import {sellerStoreReadiness,sellerStoreSchema,type SellerStoreProfile} from '../seller/store';
import {parseSellerWorkspaceRow,type SellerWorkspaceRow} from '../seller/workspace';

export const publicSellerStoreSchema=z.object({
 store:sellerStoreSchema,
 products:z.array(sellerProductSchema).max(100),
}).strict();

export const publicSellerCatalogResponseSchema=z.object({
 stores:z.array(publicSellerStoreSchema).max(50),
}).strict();

export type PublicSellerStore=z.infer<typeof publicSellerStoreSchema>;
export type PublicSellerCatalogResponse=z.infer<typeof publicSellerCatalogResponseSchema>;

export function buildPublicSellerStores(rows:SellerWorkspaceRow[]):PublicSellerStore[]{
 const stores:PublicSellerStore[]=[];
 const usedNames=new Set<string>();
 for(const row of rows){
  const workspace=parseSellerWorkspaceRow(row),store=workspace?.store;
  if(!workspace||!store||store.status!=='published'||usedNames.has(store.storeName)||isReservedStoreName(store.storeName))continue;
  const products=publishedSellerProducts(workspace.products).filter(product=>product.storeName===store.storeName);
  const productIds=new Set(products.map(product=>product.id));
  if(!sellerStoreReadiness(store,[...productIds]).ready)continue;
  stores.push({store:{...store,placements:store.placements.filter(item=>productIds.has(item.productId))},products});
  usedNames.add(store.storeName);
 }
 return stores;
}

export function parsePublicSellerCatalogResponse(value:unknown):PublicSellerCatalogResponse|null{
 const parsed=publicSellerCatalogResponseSchema.safeParse(value);
 return parsed.success?parsed.data:null;
}

export function mergePublicSellerProducts(local:SellerProduct[],remote:PublicSellerStore[]):SellerProduct[]{
 const merged=new Map(local.map(product=>[product.id,product]));
 for(const product of remote.flatMap(entry=>entry.products))if(!merged.has(product.id))merged.set(product.id,product);
 return [...merged.values()];
}

export function mergePublicSellerStores(local:SellerStoreProfile|null,remote:PublicSellerStore[]):SellerStoreProfile[]{
 const merged=new Map<string,SellerStoreProfile>();
 if(local?.status==='published')merged.set(local.storeName,local);
 for(const entry of remote)if(!merged.has(entry.store.storeName))merged.set(entry.store.storeName,entry.store);
 return [...merged.values()];
}
