import {ScanLine,Shirt} from 'lucide-react';

type SellerSection='overview'|'products'|'ads';

export default function SellerHeader({active}: {active:SellerSection}){
 const links:[SellerSection,string,string][]=[['overview','/seller','대시보드'],['products','/seller/products','상품 관리'],['ads','/seller/ads','AI 광고']];
 return <header className="seller-header"><a className="brand" href="/" aria-label="FITROOM 역할 선택으로 이동"><span className="brand-mark"><ScanLine size={23}/></span>fitroom<span className="brand-period">.</span></a><nav aria-label="판매자 메뉴">{links.map(([key,href,label])=><a key={key} className={active===key?'active':''} aria-current={active===key?'page':undefined} href={href}>{label}</a>)}</nav><a className="seller-wardrobe-link" href="/wardrobe"><Shirt/>이용자 3D 옷장</a></header>;
}
