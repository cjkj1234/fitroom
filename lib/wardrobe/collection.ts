import {z} from 'zod';
import type {Outfit,Slot} from './types';

export const WARDROBE_COLLECTION_STORAGE_KEY='fitroom.wardrobe.collection.v1';
const SLOTS:Slot[]=['hat','top','bottom'];

const outfitItemSchema=z.object({productId:z.string().min(1).max(120),size:z.string().min(1).max(40)}).strict();
const outfitSchema=z.object({hat:outfitItemSchema.optional(),top:outfitItemSchema.optional(),bottom:outfitItemSchema.optional()}).strict();
const savedLookSchema=z.object({id:z.string().min(1).max(120),name:z.string().min(1).max(40),outfit:outfitSchema,savedAt:z.string().datetime()}).strict();
export const wardrobeCollectionSchema=z.object({version:z.literal(1),favoriteProductIds:z.array(z.string().min(1).max(120)).max(100),looks:z.array(savedLookSchema).max(12)}).strict();

export type SavedLook=z.infer<typeof savedLookSchema>;
export type WardrobeCollection=z.infer<typeof wardrobeCollectionSchema>;

export function createWardrobeCollection():WardrobeCollection{return {version:1,favoriteProductIds:[],looks:[]};}

export function parseStoredWardrobeCollection(raw:string|null):WardrobeCollection{
 if(!raw)return createWardrobeCollection();
 try{const parsed=wardrobeCollectionSchema.safeParse(JSON.parse(raw));return parsed.success?parsed.data:createWardrobeCollection();}catch{return createWardrobeCollection();}
}

export function toggleFavoriteProduct(collection:WardrobeCollection,productId:string):WardrobeCollection{
 const exists=collection.favoriteProductIds.includes(productId);
 return {...collection,favoriteProductIds:exists?collection.favoriteProductIds.filter(id=>id!==productId):[productId,...collection.favoriteProductIds].slice(0,100)};
}

function outfitSignature(outfit:Outfit){return SLOTS.map(slot=>{const item=outfit[slot];return item?`${slot}:${item.productId}:${item.size}`:'';}).join('|');}

export function saveWardrobeLook(collection:WardrobeCollection,outfit:Outfit,id:string,now=new Date().toISOString()):WardrobeCollection{
 if(!SLOTS.some(slot=>outfit[slot]))return collection;
 const signature=outfitSignature(outfit),existing=collection.looks.find(look=>outfitSignature(look.outfit)===signature);
 if(existing)return {...collection,looks:[{...existing,savedAt:now},...collection.looks.filter(look=>look.id!==existing.id)]};
 const look:SavedLook={id,name:`코디 ${collection.looks.length+1}`,outfit:{...outfit},savedAt:now};
 return {...collection,looks:[look,...collection.looks].slice(0,12)};
}

export function removeSavedLook(collection:WardrobeCollection,id:string):WardrobeCollection{return {...collection,looks:collection.looks.filter(look=>look.id!==id)};}
