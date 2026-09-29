import {publishedSellerProducts,type SellerProduct,type SellerSize} from './products';
import type {Product,SizeMeasurements} from '../wardrobe/types';

export const SELLER_CATEGORY_IMAGES={top:'/catalog/3777371.png',bottom:'/catalog/3504218.png',hat:'/catalog/5067714.png'} as const;
const COLOR_MAP:Record<string,string>={
 '검정':'#24272b','검정색':'#24272b','블랙':'#24272b','black':'#24272b',
 '흰색':'#f1efea','화이트':'#f1efea','white':'#f1efea',
 '네이비':'#273347','남색':'#273347','navy':'#273347',
 '파랑':'#41658a','파란색':'#41658a','블루':'#41658a','blue':'#41658a',
 '베이지':'#b9a98f','beige':'#b9a98f','브라운':'#765846','갈색':'#765846','brown':'#765846',
 '회색':'#77797d','그레이':'#77797d','gray':'#77797d','grey':'#77797d',
 '차콜':'#474a4f','charcoal':'#474a4f','빨강':'#aa3f3f','레드':'#aa3f3f','red':'#aa3f3f',
 '초록':'#436653','그린':'#436653','green':'#436653','카키':'#6c6a4b','khaki':'#6c6a4b',
 '분홍':'#c98791','핑크':'#c98791','pink':'#c98791','보라':'#735d84','퍼플':'#735d84','purple':'#735d84',
};
const FALLBACK_COLORS=['#35455d','#6c4b55','#4e6253','#6a5b45','#555860','#3e5c62'];

export function sellerColorToHex(color:string){
 const normalized=color.trim().toLowerCase();
 if(/^#[0-9a-f]{6}$/i.test(normalized)||/^#[0-9a-f]{3}$/i.test(normalized))return normalized;
 if(COLOR_MAP[normalized])return COLOR_MAP[normalized];
 const hash=[...normalized].reduce((sum,char)=>(sum*31+char.charCodeAt(0))|0,0);
 return FALLBACK_COLORS[Math.abs(hash)%FALLBACK_COLORS.length];
}

function compactSize(size:SellerSize):SizeMeasurements{
 const result:SizeMeasurements={label:size.label};
 const keys=['length','chestFlat','shoulder','sleeve','waistFlat','hipsFlat','thighFlat','rise','headCirc'] as const;
 for(const key of keys)if(size[key]!==null)result[key]=size[key] as number;
 return result;
}

// 실루엣과 별개인 세부 디자인. 이름·특징에 적힌 말로만 판단하고, 적혀 있지 않으면 기본 형태로 둔다.
export function sellerStyle(product:SellerProduct):Product['style']{
 const text=[product.name,...product.features].join(' ').toLowerCase();
 if(product.category==='top'&&(/(^|[^티])셔츠/.test(text)||/(^|[^a-z-])shirt/.test(text)))return 'shirt';
 if(product.category==='bottom'&&/카펜터|카고|워크\s?팬츠|carpenter|cargo/.test(text))return 'carpenter';
 return undefined;
}

function silhouette(product:SellerProduct):Product['silhouette']{
 const text=[product.name,...product.features].join(' ').toLowerCase();
 if(product.category==='hat')return 'cap';
 if(product.category==='bottom')return text.includes('와이드')||text.includes('wide')?'wide':'straight';
 if(text.includes('스트라이프')||text.includes('줄무늬')||text.includes('stripe'))return 'stripe';
 if(text.includes('브이넥')||text.includes('v넥')||text.includes('v-neck'))return 'vneck';
 return 'tee';
}

export function sellerProductToWardrobeProduct(product:SellerProduct):Product{
 const descriptor=[product.name,...product.features,product.material??''].join(' ').toLowerCase();
 return {
  id:`seller:${product.id}`,sellerProductId:product.id,source:'seller',slot:product.category,
  brand:product.storeName,name:product.name,color:product.colorHex??sellerColorToHex(product.color),colorName:product.color,style:sellerStyle(product),
  url:product.purchaseUrl??'',checkedAt:product.updatedAt.slice(0,10),sizes:product.sizes.map(compactSize),defaultSize:product.sizes[0].label,
  silhouette:silhouette(product),elasticWaist:product.category==='bottom'&&(descriptor.includes('밴딩')||descriptor.includes('고무')),
  adjustableHat:product.category==='hat'&&(descriptor.includes('조절')||descriptor.includes('스트랩')),
  note:'판매자가 입력한 색상·실측을 기본 의상 형태에 적용한 참고용 3D 표현입니다. 실제 원단과 세부 디자인은 아직 반영되지 않습니다.',
  measurementBasis:'판매자가 직접 입력한 상품 실측. 누락된 값은 비교하지 않습니다.',image:SELLER_CATEGORY_IMAGES[product.category],
  priceKrw:product.priceKrw??undefined,stock:product.stock??undefined,
 };
}

export function publishedSellerCatalog(products:SellerProduct[]){
 return publishedSellerProducts(products).map(sellerProductToWardrobeProduct);
}
