import {z} from 'zod';
import {sellerProductSchema,type SellerProduct} from './products';
import {sellerStoreSchema,type SellerStoreProfile} from './store';

export const SELLER_WORKSPACE_VERSION=1 as const;
export const sellerWorkspacePayloadSchema=z.object({
 version:z.literal(SELLER_WORKSPACE_VERSION),
 products:z.array(sellerProductSchema).max(100),
 store:sellerStoreSchema.nullable(),
}).strict();

export type SellerWorkspacePayload=z.infer<typeof sellerWorkspacePayloadSchema>;
export type SellerWorkspaceSnapshot=SellerWorkspacePayload&{updatedAt:string};
export type SellerWorkspaceRow={productsJson:string;storeJson:string|null;updatedAt:string};

export function createSellerWorkspacePayload(products:SellerProduct[],store:SellerStoreProfile|null):SellerWorkspacePayload|null{
 const parsed=sellerWorkspacePayloadSchema.safeParse({version:SELLER_WORKSPACE_VERSION,products,store});
 return parsed.success?parsed.data:null;
}

export function parseSellerWorkspaceRow(row:SellerWorkspaceRow):SellerWorkspaceSnapshot|null{
 try{
  const parsed=sellerWorkspacePayloadSchema.safeParse({version:SELLER_WORKSPACE_VERSION,products:JSON.parse(row.productsJson),store:row.storeJson?JSON.parse(row.storeJson):null});
  if(!parsed.success||Number.isNaN(Date.parse(row.updatedAt)))return null;
  return {...parsed.data,updatedAt:new Date(row.updatedAt).toISOString()};
 }catch{return null;}
}

export function sellerWorkspaceSummary(workspace:SellerWorkspaceSnapshot|null){
 return workspace?{productCount:workspace.products.length,publishedCount:workspace.products.filter(product=>product.status==='published').length,hasStore:Boolean(workspace.store),updatedAt:workspace.updatedAt}:{productCount:0,publishedCount:0,hasStore:false,updatedAt:null};
}
