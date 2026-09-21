import {z} from 'zod';

export const SELLER_PRODUCTS_STORAGE_KEY='fitroom.seller.products.v1';
export const SELLER_CATEGORIES=['top','bottom','hat'] as const;
export const SELLER_PRODUCT_STATUSES=['draft','published'] as const;
export type SellerCategory=(typeof SELLER_CATEGORIES)[number];
export type SellerProductStatus=(typeof SELLER_PRODUCT_STATUSES)[number];
export const SELLER_CATEGORY_LABELS:Record<SellerCategory,string>={top:'상의',bottom:'하의',hat:'모자'};

export const SELLER_MEASUREMENT_KEYS=['length','chestFlat','shoulder','sleeve','waistFlat','hipsFlat','thighFlat','rise','headCirc'] as const;
export type SellerMeasurementKey=(typeof SELLER_MEASUREMENT_KEYS)[number];
export const SELLER_MEASUREMENT_FIELDS:Record<SellerCategory,Array<{key:SellerMeasurementKey;label:string}>>={
 top:[{key:'length',label:'총장'},{key:'chestFlat',label:'가슴단면'},{key:'shoulder',label:'어깨'},{key:'sleeve',label:'소매'}],
 bottom:[{key:'length',label:'총장'},{key:'waistFlat',label:'허리단면'},{key:'hipsFlat',label:'엉덩이단면'},{key:'thighFlat',label:'허벅지단면'},{key:'rise',label:'밑위'}],
 hat:[{key:'headCirc',label:'머리둘레'}],
};

const requiredText=(max:number)=>z.string().trim().min(1).max(max);
const optionalMeasurement=z.number().finite().positive().max(500).nullable();
const optionalPurchaseUrl=z.union([z.string().trim().url().max(500).refine(value=>/^https?:\/\//i.test(value)),z.null()]).default(null);
export const sellerSizeSchema=z.object({
 label:requiredText(20),
 length:optionalMeasurement,chestFlat:optionalMeasurement,shoulder:optionalMeasurement,sleeve:optionalMeasurement,
 waistFlat:optionalMeasurement,hipsFlat:optionalMeasurement,thighFlat:optionalMeasurement,rise:optionalMeasurement,headCirc:optionalMeasurement,
}).strict();

export const sellerProductSchema=z.object({
 version:z.literal(1),id:requiredText(100),storeName:requiredText(40),name:requiredText(80),category:z.enum(SELLER_CATEGORIES),color:requiredText(40),
 features:z.array(requiredText(100)).min(1).max(5),material:z.union([requiredText(100),z.null()]),
 priceKrw:z.number().int().min(0).max(100_000_000).nullable(),stock:z.number().int().min(0).max(1_000_000).nullable(),
 purchaseUrl:optionalPurchaseUrl,
 sizes:z.array(sellerSizeSchema).max(6),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),
 status:z.enum(SELLER_PRODUCT_STATUSES).default('draft'),publishedAt:z.union([z.string().datetime(),z.null()]).default(null),
}).strict();

export type SellerSize=z.infer<typeof sellerSizeSchema>;
export type SellerProduct=z.infer<typeof sellerProductSchema>;

const REQUIRED_MEASUREMENTS:Record<SellerCategory,SellerMeasurementKey[]>={top:['length','chestFlat'],bottom:['length','waistFlat'],hat:['headCirc']};

export function emptySellerSize(label=''):SellerSize{return {label,length:null,chestFlat:null,shoulder:null,sleeve:null,waistFlat:null,hipsFlat:null,thighFlat:null,rise:null,headCirc:null};}

export function parseStoredSellerProducts(raw:string|null){
 if(!raw)return [];
 try{
  const value:unknown=JSON.parse(raw);if(!Array.isArray(value))return [];
  return value.flatMap(item=>{const parsed=sellerProductSchema.safeParse(item);return parsed.success?[parsed.data]:[];});
 }catch{return [];}
}

export function upsertSellerProduct(products:SellerProduct[],product:SellerProduct){return [product,...products.filter(item=>item.id!==product.id)];}

export function productReadiness(product:SellerProduct){
 const missing:string[]=[];
 if(product.priceKrw===null)missing.push('판매가');
 if(product.stock===null)missing.push('재고');
 const hasSizes=product.sizes.length>0;
 if(!hasSizes)missing.push('사이즈');
 const required=REQUIRED_MEASUREMENTS[product.category];
 if(!hasSizes||product.sizes.some(size=>required.some(key=>size[key]===null)))missing.push('필수 실측');
 const completed=4-missing.length;
 return {ready:missing.length===0,percent:Math.max(0,completed)*25,missing};
}

export function publishSellerProduct(product:SellerProduct,now=new Date().toISOString()):SellerProduct|null{
 if(!productReadiness(product).ready)return null;
 return {...product,status:'published',publishedAt:product.publishedAt??now,updatedAt:now};
}

export function unpublishSellerProduct(product:SellerProduct,now=new Date().toISOString()):SellerProduct{
 return {...product,status:'draft',publishedAt:null,updatedAt:now};
}

export function normalizeSellerProductPublication(product:SellerProduct):SellerProduct{
 return product.status==='published'&&!productReadiness(product).ready?{...product,status:'draft',publishedAt:null}:product;
}

export function publishedSellerProducts(products:SellerProduct[]){
 return products.filter(product=>product.status==='published'&&productReadiness(product).ready);
}
