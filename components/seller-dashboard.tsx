'use client';

import {useEffect,useState} from 'react';
import {ArrowRight,Box,CheckCircle2,Megaphone,PackagePlus} from 'lucide-react';
import SellerHeader from '@/components/seller-header';
import {SELLER_CATEGORY_LABELS,SELLER_PRODUCTS_STORAGE_KEY,parseStoredSellerProducts,productReadiness,type SellerProduct} from '@/lib/seller/products';

export default function SellerDashboard(){
 const [products,setProducts]=useState<SellerProduct[]>([]);
 useEffect(()=>{try{setProducts(parseStoredSellerProducts(localStorage.getItem(SELLER_PRODUCTS_STORAGE_KEY)));}catch{}},[]);
 const ready=products.filter(product=>productReadiness(product).ready).length;
 return <main className="seller-app"><SellerHeader active="overview"/><section className="seller-page-heading"><div><span className="eyebrow">SELLER WORKSPACE</span><h1>판매자 대시보드</h1><p>상품 정보를 정리하고 광고 문구 제작까지 한 흐름으로 관리하세요.</p></div><a className="seller-primary-link" href="/seller/products"><PackagePlus/>상품 등록하기</a></section>
  <section className="seller-stats" aria-label="판매자 현황"><article><span><Box/></span><div><small>등록 상품</small><strong>{products.length}</strong><p>이 브라우저에 저장된 상품</p></div></article><article><span><CheckCircle2/></span><div><small>게시 준비</small><strong>{ready}</strong><p>가격·재고·필수 실측 완료</p></div></article><article><span><Megaphone/></span><div><small>AI 광고</small><strong>3안</strong><p>상품별 서로 다른 관점의 초안</p></div></article></section>
  <section className="seller-dashboard-grid"><article className="seller-panel"><div className="seller-panel-heading"><div><span className="eyebrow">PRODUCTS</span><h2>최근 상품</h2></div><a href="/seller/products">전체 관리 <ArrowRight/></a></div>{products.length===0?<div className="seller-empty"><PackagePlus/><h3>아직 등록한 상품이 없어요</h3><p>첫 상품의 기본 정보와 사이즈 실측을 입력해 보세요.</p><a href="/seller/products">첫 상품 등록하기</a></div>:<div className="seller-product-list">{products.slice(0,4).map(product=>{const state=productReadiness(product);return <article key={product.id}><span className="seller-product-symbol">{SELLER_CATEGORY_LABELS[product.category].slice(0,1)}</span><div><strong>{product.name}</strong><small>{product.storeName} · {SELLER_CATEGORY_LABELS[product.category]} · {product.color}</small></div><span className={state.ready?'ready':'draft'}>{state.ready?'게시 준비':'작성 중'}</span><a href={`/seller/ads?product=${encodeURIComponent(product.id)}`} aria-label={`${product.name} 광고 만들기`}>광고 만들기</a></article>;})}</div>}</article>
   <aside className="seller-panel seller-next"><span className="eyebrow">WORKFLOW</span><h2>판매자 작업 순서</h2><ol><li><b>01</b><div><strong>상품 정보 등록</strong><span>가격·재고·색상·특징 입력</span></div></li><li><b>02</b><div><strong>사이즈 실측 입력</strong><span>카테고리별 필수 치수 확인</span></div></li><li><b>03</b><div><strong>AI 광고 초안 제작</strong><span>선택 상품을 자동으로 불러오기</span></div></li></ol><p>계정과 서버 게시 기능은 다음 연결 단계입니다. 현재 상품 정보는 이 브라우저에만 저장됩니다.</p></aside>
  </section><footer className="seller-footer"><span>FITROOM SELLER · 의류 소상공인을 위한 작업공간</span><span>상품 사진과 등록 정보의 서버 저장은 아직 연결되지 않았습니다.</span></footer>
 </main>;
}
