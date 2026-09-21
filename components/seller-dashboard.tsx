'use client';

import {useEffect,useState} from 'react';
import {ArrowRight,Box,CheckCircle2,Eye,Megaphone,PackagePlus} from 'lucide-react';
import SellerHeader from '@/components/seller-header';
import {SELLER_CATEGORY_LABELS,SELLER_PRODUCTS_STORAGE_KEY,parseStoredSellerProducts,productReadiness,type SellerProduct} from '@/lib/seller/products';

export default function SellerDashboard(){
 const [products,setProducts]=useState<SellerProduct[]>([]);
 useEffect(()=>{try{setProducts(parseStoredSellerProducts(localStorage.getItem(SELLER_PRODUCTS_STORAGE_KEY)));}catch{}},[]);
 const ready=products.filter(product=>productReadiness(product).ready).length,published=products.filter(product=>product.status==='published').length;
 return <main className="seller-app"><SellerHeader active="overview"/><section className="seller-page-heading"><div><span className="eyebrow">SMALL BUSINESS WORKSPACE</span><h1>소상공인 판매자 센터</h1><p>상품을 등록해 3D 옷장에 게시하고, 내 상점으로 고객을 연결하세요.</p></div><a className="seller-primary-link" href="/seller/products"><PackagePlus/>상품 등록하기</a></section>
  <section className="seller-stats" aria-label="판매자 현황"><article><span><Box/></span><div><small>등록 상품</small><strong>{products.length}</strong><p>이 브라우저에 저장된 상품</p></div></article><article><span><CheckCircle2/></span><div><small>게시 준비</small><strong>{ready}</strong><p>가격·재고·필수 실측 완료</p></div></article><article><span><Eye/></span><div><small>게시 중</small><strong>{published}</strong><p>이용자 옷장에 공개된 상품</p></div></article><article><span><Megaphone/></span><div><small>AI 광고</small><strong>3안</strong><p>상품별 서로 다른 관점의 초안</p></div></article></section>
  <section className="seller-dashboard-grid"><article className="seller-panel"><div className="seller-panel-heading"><div><span className="eyebrow">PRODUCTS</span><h2>최근 상품</h2></div><a href="/seller/products">전체 관리 <ArrowRight/></a></div>{products.length===0?<div className="seller-empty"><PackagePlus/><h3>아직 등록한 상품이 없어요</h3><p>첫 상품의 기본 정보와 사이즈 실측을 입력해 보세요.</p><a href="/seller/products">첫 상품 등록하기</a></div>:<div className="seller-product-list">{products.slice(0,4).map(product=>{const state=productReadiness(product),published=product.status==='published';return <article key={product.id}><span className="seller-product-symbol">{SELLER_CATEGORY_LABELS[product.category].slice(0,1)}</span><div><strong>{product.name}</strong><small>{product.storeName} · {SELLER_CATEGORY_LABELS[product.category]} · {product.color}</small></div><span className={published?'published':state.ready?'ready':'draft'}>{published?'게시 중':state.ready?'게시 준비':'작성 중'}</span><a href={`/seller/ads?product=${encodeURIComponent(product.id)}`} aria-label={`${product.name} 광고 만들기`}>광고 만들기</a></article>;})}</div>}</article>
   <aside className="seller-panel seller-next"><span className="eyebrow">WORKFLOW</span><h2>판매자 작업 순서</h2><ol><li><b>01</b><div><strong>상품 정보 등록</strong><span>가격·재고·색상·특징 입력</span></div></li><li><b>02</b><div><strong>사이즈 실측 입력</strong><span>카테고리별 필수 치수 확인</span></div></li><li><b>03</b><div><strong>이용자 옷장에 게시</strong><span>3D 참고 실루엣과 핏 비교 확인</span></div></li><li><b>04</b><div><strong>AI 광고 초안 제작</strong><span>선택 상품을 자동으로 불러오기</span></div></li></ol><p>게시 상품은 같은 브라우저의 이용자 옷장에 표시됩니다. 다른 기기 공유는 서버 연결 단계에서 추가합니다.</p></aside>
  </section><footer className="seller-footer"><span>FITROOM SELLER · 의류 소상공인을 위한 작업공간</span><span>상품 사진과 등록 정보의 서버 저장은 아직 연결되지 않았습니다.</span></footer>
 </main>;
}
