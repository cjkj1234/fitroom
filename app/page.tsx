import {ArrowRight,ScanLine,Shirt,Store} from 'lucide-react';

export default function Home(){
 return <main className="role-app">
  <header className="role-header"><a className="brand" href="/" aria-label="FITROOM 홈"><span className="brand-mark"><ScanLine size={23}/></span>fitroom<span className="brand-period">.</span></a><span>LOCAL FASHION WORKSPACE</span></header>
  <section className="role-hero" aria-labelledby="role-title">
   <div className="role-intro"><span className="eyebrow">SMALL SHOP, BIG FIT</span><h1 id="role-title">작은 상점과 고객을 이어주는 옷장</h1><p>소상공인은 상품을 직접 알리고, 이용자는 내 체형으로 입어본 뒤 상점을 발견합니다.</p></div>
   <div className="role-grid">
    <a className="role-card seller-role" href="/seller"><div className="role-card-top"><span className="role-icon"><Store/></span><span className="role-number">01</span></div><span className="role-label">의류 소상공인</span><h2>내 상품을 직접 등록하고 알리기</h2><p>가격·재고·실측과 상점 링크를 등록해 3D 옷장에 게시하고 SNS 광고 초안을 만듭니다.</p><ul><li>상품·사이즈 실측 등록</li><li>이용자 3D 옷장에 게시</li><li>AI 광고 문구 제작</li></ul><span className="role-action">판매자 센터로 이동 <ArrowRight/></span></a>
    <a className="role-card shopper-role" href="/wardrobe"><div className="role-card-top"><span className="role-icon"><Shirt/></span><span className="role-number">02</span></div><span className="role-label">동네 상점 고객</span><h2>작은 브랜드를 내 체형으로 만나기</h2><p>여러 소상공인 상점의 옷을 아바타에 조합하고 사이즈별 예상 여유를 확인합니다.</p><ul><li>동네 상점 상품 발견</li><li>모자·상의·하의 입어보기</li><li>실측 비교 후 상점으로 이동</li></ul><span className="role-action">3D 옷장으로 이동 <ArrowRight/></span></a>
   </div>
  </section>
  <footer className="role-footer"><span>FITROOM · 의류 소상공인과 고객을 잇는 패션 워크스페이스</span><span>각 페이지는 언제든 상단 메뉴에서 이동할 수 있어요.</span></footer>
 </main>;
}
