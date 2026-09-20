import type {Metadata} from 'next';
import SellerProducts from '@/components/seller-products';

export const metadata:Metadata={title:'상품 등록과 관리 — FITROOM SELLER',description:'의류 상품의 가격, 재고, 색상과 사이즈별 실측을 등록하세요.'};

export default function SellerProductsPage(){return <SellerProducts/>;}
