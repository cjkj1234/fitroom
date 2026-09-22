import {z} from 'zod';
import type {WardrobeCollection} from './collection';

export const WARDROBE_INTEREST_STORAGE_KEY='fitroom.wardrobe.interest.v1';
export const INTEREST_SIGNAL_TYPES=['favorite_add','try_on','recommendation_open','look_save'] as const;
export type InterestSignalType=(typeof INTEREST_SIGNAL_TYPES)[number];

const interestEventSchema=z.object({
 id:z.string().min(1).max(120),
 type:z.enum(INTEREST_SIGNAL_TYPES),
 productIds:z.array(z.string().min(1).max(120)).min(1).max(3),
 occurredAt:z.string().datetime(),
}).strict();
const interestLogSchema=z.object({version:z.literal(1),events:z.array(interestEventSchema).max(200)}).strict();

export type InterestEvent=z.infer<typeof interestEventSchema>;
export type InterestLog=z.infer<typeof interestLogSchema>;
export type ProductInterestSummary={productId:string;favorite:number;savedLooks:number;tryOns:number;recommendationOpens:number;score:number;lastOccurredAt:string|null};

export function createInterestLog():InterestLog{return {version:1,events:[]};}

export function parseStoredInterestLog(raw:string|null):InterestLog{
 if(!raw)return createInterestLog();
 try{const parsed=interestLogSchema.safeParse(JSON.parse(raw));return parsed.success?parsed.data:createInterestLog();}catch{return createInterestLog();}
}

export function appendInterestEvent(log:InterestLog,type:InterestSignalType,productIds:string[],id:string,occurredAt=new Date().toISOString()):InterestLog{
 const unique=[...new Set(productIds.map(productId=>productId.trim()).filter(Boolean))].slice(0,3);
 const parsed=interestEventSchema.safeParse({id,type,productIds:unique,occurredAt});
 if(!parsed.success)return log;
 return {...log,events:[parsed.data,...log.events].slice(0,200)};
}

export function summarizeProductInterest(productIds:string[],collection:WardrobeCollection,log:InterestLog):ProductInterestSummary[]{
 return productIds.map(productId=>{
  const favorite=collection.favoriteProductIds.includes(productId)?1:0;
  const savedLooks=collection.looks.filter(look=>Object.values(look.outfit).some(item=>item?.productId===productId)).length;
  const events=log.events.filter(event=>event.productIds.includes(productId));
  const tryOns=events.filter(event=>event.type==='try_on').length;
  const recommendationOpens=events.filter(event=>event.type==='recommendation_open').length;
  const lastOccurredAt=events[0]?.occurredAt??null;
  return {productId,favorite,savedLooks,tryOns,recommendationOpens,score:favorite*4+savedLooks*3+tryOns+recommendationOpens*2,lastOccurredAt};
 }).sort((a,b)=>b.score-a.score||productIds.indexOf(a.productId)-productIds.indexOf(b.productId));
}
