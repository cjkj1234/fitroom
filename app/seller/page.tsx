import type {Metadata} from 'next';
import SellerDashboard from '@/components/seller-dashboard';

export const metadata:Metadata={title:'판매자 대시보드 — FITROOM',description:'의류 상품을 등록하고 AI 광고 제작까지 한 흐름으로 관리하세요.'};

export default function SellerPage(){return <SellerDashboard/>;}
