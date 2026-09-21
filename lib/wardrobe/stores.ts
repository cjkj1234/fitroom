import type {Product,Slot} from './types';

export type VirtualStore={name:string;products:Product[];slots:Slot[];accent:string;hasLiveSellerItems:boolean};

export function buildVirtualStores(products:Product[]):VirtualStore[]{
 const grouped=new Map<string,Product[]>();
 for(const product of products)grouped.set(product.brand,[...(grouped.get(product.brand)??[]),product]);
 return [...grouped.entries()].map(([name,items])=>({
  name,products:items,slots:[...new Set(items.map(item=>item.slot))],accent:items[0].color,
  hasLiveSellerItems:items.some(item=>item.source==='seller'),
 })).sort((a,b)=>Number(b.hasLiveSellerItems)-Number(a.hasLiveSellerItems)||b.products.length-a.products.length||a.name.localeCompare(b.name,'ko'));
}
