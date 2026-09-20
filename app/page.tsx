import {ArrowRight,ScanLine,Shirt,Store} from 'lucide-react';

export default function Home(){
 return <main className="role-app">
  <header className="role-header"><a className="brand" href="/" aria-label="FITROOM 홈"><span className="brand-mark"><ScanLine size={23}/></span>fitroom<span className="brand-period">.</span></a><span>FASHION WORKSPACE</span></header>
  <section className="role-hero" aria-labelledby="role-title">
   <div className="role-intro"><span className="eyebrow">CHOOSE YOUR SPACE</span><h1 id="role-title">어떤 일을 하러 오셨나요?</h1><p>판매자와 옷을 찾는 이용자에게 필요한 기능을 각각의 공간에 담았습니다.</p></div>
   <div className="role-grid">
    <a className="role-card seller-role" href="/seller"><div className="role-card-top"><span className="role-icon"><Store/></span><span className="role-number">01</span></div><span className="role-label">의류 판매자</span><h2>상품 등록과 광고 만들기</h2><p>상품·사이즈 정보를 관리하고 등록한 내용으로 SNS 광고 초안을 만듭니다.</p><ul><li>가격·재고·실측 등록</li><li>AI 문구 생성과 검토</li><li>TXT·PNG로 저장</li></ul><span className="role-action">판매자 센터로 이동 <ArrowRight/></span></a>
    <a className="role-card shopper-role" href="/wardrobe"><div className="role-card-top"><span className="role-icon"><Shirt/></span><span className="role-number">02</span></div><span className="role-label">옷을 찾는 이용자</span><h2>내 체형으로 3D 코디하기</h2><p>내 체형에 가까운 아바타에 옷을 조합하고 상품 실측과 예상 여유를 확인합니다.</p><ul><li>체형 설정과 기기 내 저장</li><li>모자·상의·하의 입어보기</li><li>사이즈별 실측 비교</li></ul><span className="role-action">3D 옷장으로 이동 <ArrowRight/></span></a>
   </div>
  </section>
  <footer className="role-footer"><span>FITROOM · 판매자와 이용자를 잇는 패션 워크스페이스</span><span>각 페이지는 언제든 상단 메뉴에서 이동할 수 있어요.</span></footer>
 </main>;
}
