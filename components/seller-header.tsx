import Link from 'next/link';
import {ScanLine,Shirt} from 'lucide-react';

type SellerSection='overview'|'products'|'store'|'ads';

export default function SellerHeader({active}: {active:SellerSection}){
 const links:[SellerSection,string,string][]=[['overview','/seller','대시보드'],['products','/seller/products','상품 관리'],['store','/seller/store','가상 매장'],['ads','/seller/ads','AI 광고']];
 return <header className="seller-header"><Link className="brand" href="/" aria-label="FITROOM 역할 선택으로 이동"><span className="brand-mark"><ScanLine size={23}/></span>fitroom<span className="brand-period">.</span></Link><nav aria-label="판매자 메뉴">{links.map(([key,href,label])=><Link key={key} className={active===key?'active':''} aria-current={active===key?'page':undefined} href={href}>{label}</Link>)}</nav><Link className="seller-wardrobe-link" href="/wardrobe"><Shirt/>이용자 3D 옷장</Link></header>;
}
