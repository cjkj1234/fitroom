import type {Metadata} from 'next';
import Wardrobe from '@/components/wardrobe';

export const metadata:Metadata={title:'이용자 3D 웹 옷장 — FITROOM',description:'내 체형에 가까운 3D 아바타에 옷을 조합하고 상품 실측과 예상 핏을 확인하세요.'};

export default function WardrobePage(){return <Wardrobe/>;}
