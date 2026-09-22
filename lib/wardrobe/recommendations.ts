import type {WardrobeCollection} from './collection';
import type {Product,Slot} from './types';

const SLOT_LABELS:Record<Slot,string>={hat:'모자',top:'상의',bottom:'하의'};
type Seed={product:Product;weight:number;favorite:boolean};
export type ProductRecommendation={productId:string;score:number;reasons:string[]};

export function recommendWardrobeProducts(products:Product[],collection:WardrobeCollection,limit=4):ProductRecommendation[]{
 const byId=new Map(products.map(product=>[product.id,product]));
 const usedIds=new Set<string>(),seeds:Seed[]=[];
 for(const id of collection.favoriteProductIds){const product=byId.get(id);if(product){seeds.push({product,weight:3,favorite:true});usedIds.add(id);}}
 for(const look of collection.looks)for(const worn of Object.values(look.outfit)){if(!worn)continue;const product=byId.get(worn.productId);if(product){seeds.push({product,weight:1,favorite:false});usedIds.add(product.id);}}
 if(seeds.length===0)return [];
 return products.flatMap((candidate,index)=>{
  if(usedIds.has(candidate.id))return [];
  let score=0;const reasonScores=new Map<string,number>();
  const add=(reason:string,value:number)=>{score+=value;reasonScores.set(reason,(reasonScores.get(reason)??0)+value);};
  for(const seed of seeds){
   if(candidate.brand===seed.product.brand)add(seed.favorite?`${candidate.brand}에서 찜한 취향`:'저장 코디와 같은 상점',4*seed.weight);
   if(candidate.slot===seed.product.slot)add(seed.favorite?`찜한 ${SLOT_LABELS[candidate.slot]} 취향`:`저장 코디에 어울리는 ${SLOT_LABELS[candidate.slot]}`,2*seed.weight);
   if(candidate.colorName.trim().toLowerCase()===seed.product.colorName.trim().toLowerCase())add(`${candidate.colorName} 색상 취향`,2*seed.weight);
   if(candidate.silhouette===seed.product.silhouette)add('비슷한 실루엣',seed.weight);
  }
  if(score===0)return [];
  const reasons=[...reasonScores.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ko')).slice(0,2).map(([reason])=>reason);
  return [{productId:candidate.id,score,reasons,index}];
 }).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,Math.max(0,limit)).map(({productId,score,reasons})=>({productId,score,reasons}));
}
