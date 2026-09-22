import {z} from 'zod';

export const SELLER_STORE_STORAGE_KEY='fitroom.seller.store.v1';
export const SELLER_STORE_THEMES=['modern','warm','mono'] as const;
export const SELLER_STORE_MUSIC=['calm','city','none'] as const;
export const SELLER_STORE_ZONES=['left-wall','center-rack','right-wall','feature-table'] as const;
export type SellerStoreTheme=(typeof SELLER_STORE_THEMES)[number];
export type SellerStoreMusic=(typeof SELLER_STORE_MUSIC)[number];
export type SellerStoreZone=(typeof SELLER_STORE_ZONES)[number];

export const SELLER_STORE_THEME_LABELS:Record<SellerStoreTheme,string>={modern:'모던 미니멀',warm:'웜 부티크',mono:'모노 갤러리'};
export const SELLER_STORE_MUSIC_LABELS:Record<SellerStoreMusic,string>={calm:'Breezy Day',city:'City Walk',none:'음악 없음'};
export const SELLER_STORE_ZONE_LABELS:Record<SellerStoreZone,string>={'left-wall':'왼쪽 벽면','center-rack':'중앙 행거','right-wall':'오른쪽 벽면','feature-table':'추천 테이블'};
export const SELLER_STORE_THEME_ACCENTS:Record<SellerStoreTheme,string>={modern:'#2557d6',warm:'#9a6a48',mono:'#30343a'};

const placementSchema=z.object({productId:z.string().trim().min(1).max(100),zone:z.enum(SELLER_STORE_ZONES)}).strict();
export const sellerStoreSchema=z.object({
 version:z.literal(1),storeName:z.string().trim().min(1).max(40),tagline:z.string().trim().min(1).max(80),theme:z.enum(SELLER_STORE_THEMES),music:z.enum(SELLER_STORE_MUSIC),
 placements:z.array(placementSchema).max(12),previewConfirmed:z.boolean(),status:z.enum(['draft','published']),updatedAt:z.string().datetime(),publishedAt:z.string().datetime().nullable(),
}).strict();

export type SellerStoreProfile=z.infer<typeof sellerStoreSchema>;

export function createDefaultSellerStore(storeName='오후옷장',now=new Date().toISOString()):SellerStoreProfile{
 return {version:1,storeName,tagline:'오늘도, 기분 좋은 옷',theme:'modern',music:'calm',placements:[],previewConfirmed:false,status:'draft',updatedAt:now,publishedAt:null};
}

export function parseStoredSellerStore(raw:string|null):SellerStoreProfile|null{
 if(!raw)return null;
 try{const parsed=sellerStoreSchema.safeParse(JSON.parse(raw));return parsed.success?parsed.data:null;}catch{return null;}
}

export function placeSellerProduct(profile:SellerStoreProfile,productId:string,zone:SellerStoreZone):SellerStoreProfile{
 const withoutProduct=profile.placements.filter(item=>item.productId!==productId);
 const zoneItems=withoutProduct.filter(item=>item.zone===zone);
 const placements=zoneItems.length>=3?withoutProduct.filter(item=>item!==zoneItems[0]):withoutProduct;
 return {...profile,placements:[...placements,{productId,zone}],status:'draft',publishedAt:null};
}

export function removeSellerProductPlacement(profile:SellerStoreProfile,productId:string):SellerStoreProfile{
 return {...profile,placements:profile.placements.filter(item=>item.productId!==productId),status:'draft',publishedAt:null};
}

export function sellerStoreLayout(profile:SellerStoreProfile,availableProductIds:string[]):Record<SellerStoreZone,string[]>{
 const available=new Set(availableProductIds);
 return Object.fromEntries(SELLER_STORE_ZONES.map(zone=>[zone,profile.placements.filter(item=>item.zone===zone&&available.has(item.productId)).map(item=>item.productId)])) as Record<SellerStoreZone,string[]>;
}

export function stepSellerStoreZone(current:SellerStoreZone,direction:-1|1):SellerStoreZone{
 const index=SELLER_STORE_ZONES.indexOf(current);
 return SELLER_STORE_ZONES[(index+direction+SELLER_STORE_ZONES.length)%SELLER_STORE_ZONES.length];
}

export function sellerStoreReadiness(profile:SellerStoreProfile,publishedProductIds:string[]){
 const published=new Set(publishedProductIds);
 const steps=[
  {id:'identity',label:'매장 정보 설정',complete:Boolean(profile.storeName.trim()&&profile.tagline.trim())},
  {id:'theme',label:'매장 테마 선택',complete:SELLER_STORE_THEMES.includes(profile.theme)},
  {id:'products',label:'상품 게시',complete:published.size>0},
  {id:'placement',label:'상품 배치 완료',complete:profile.placements.some(item=>published.has(item.productId))},
  {id:'preview',label:'상점 미리보기 확인',complete:profile.previewConfirmed},
 ];
 const complete=steps.filter(step=>step.complete).length;
 return {ready:complete===steps.length,complete,total:steps.length,percent:complete/steps.length*100,steps};
}

export function publishSellerStore(profile:SellerStoreProfile,publishedProductIds:string[],now=new Date().toISOString()):SellerStoreProfile|null{
 if(!sellerStoreReadiness(profile,publishedProductIds).ready)return null;
 return {...profile,status:'published',updatedAt:now,publishedAt:profile.publishedAt??now};
}

export function normalizeSellerStore(profile:SellerStoreProfile,publishedProductIds:string[]):SellerStoreProfile{
 return profile.status==='published'&&!sellerStoreReadiness(profile,publishedProductIds).ready?{...profile,status:'draft',publishedAt:null}:profile;
}

export function unpublishSellerStore(profile:SellerStoreProfile,now=new Date().toISOString()):SellerStoreProfile{
 return {...profile,status:'draft',updatedAt:now,publishedAt:null};
}
