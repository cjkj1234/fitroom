import type {Metadata} from 'next';
import AdStudio from '@/components/ad-studio';

export const metadata:Metadata={title:'AI 광고 스튜디오 — FITROOM SELLER',description:'등록한 상품 정보로 의류 광고 문구 초안 3개를 만들고 편집·저장하세요.'};

export default function SellerAdsPage(){return <AdStudio/>;}
