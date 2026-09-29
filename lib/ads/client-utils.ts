import type {SellerProduct} from '../seller/products';

export type ExportableDraft={headline:string;body:string;cta:string;hashtags:string};

// 등록 상품의 사실 정보만 광고 입력으로 옮긴다. 할인율은 상품마다 달라 항상 비운다.
export function sellerProductToAdFields(product:SellerProduct){
 return {
  storeName:product.storeName,productName:product.name,category:product.category,color:product.color,
  features:product.features.join(', '),material:product.material??'',
  price:product.priceKrw===null?'':String(product.priceKrw),discount:'',
 };
}

export function parseOptionalNumberInput(value:string){
 const trimmed=value.trim();
 if(!trimmed)return null;
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)\s*(?:원|%)?$/.test(trimmed))return Number.NaN;
 return Number(trimmed.replace(/[^0-9]/g,''));
}

export function safeDownloadBaseName(value:string){
 const cleaned=value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/\s+/g,' ').replace(/[. ]+$/g,'').slice(0,60);
 return cleaned||'상품';
}

export function formatDraftText(draft:ExportableDraft){
 const hashtags=draft.hashtags.split(/[\s,]+/).filter(Boolean).map(tag=>tag.startsWith('#')?tag:`#${tag}`).join(' ');
 return `${draft.headline}\n\n${draft.body}\n\n${draft.cta}\n\n${hashtags}`;
}
