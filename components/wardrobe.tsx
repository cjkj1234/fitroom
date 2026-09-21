'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUpRight,Check,ChevronLeft,ChevronRight,Info,Plus,ScanLine,Shirt,SlidersHorizontal,Sparkles,Store,X} from 'lucide-react';
import AvatarView from '@/components/avatar-view';
import BodyEditor from '@/components/body-editor';
import {publishedSellerCatalog} from '@/lib/seller/catalog';
import {parseStoredSellerProducts,SELLER_PRODUCTS_STORAGE_KEY} from '@/lib/seller/products';
import {DEFAULT_BODY,parseStoredBody,sourceLabel,STORAGE_KEY} from '@/lib/wardrobe/body';
import {PRODUCTS,SLOT_LABELS} from '@/lib/wardrobe/catalog';
import {estimateFit,remove,wear} from '@/lib/wardrobe/fit';
import type {BodyProfile,Outfit,Product,Slot} from '@/lib/wardrobe/types';
import {useWardrobeTools} from '@/lib/wardrobe/webmcp';

const MEASUREMENT_LABELS:Record<string,string>={length:'총장',chestFlat:'가슴단면',chestCirc:'가슴둘레',shoulder:'어깨너비',sleeve:'소매길이',waistFlat:'허리단면',hipsFlat:'엉덩이단면',thighFlat:'허벅지단면',rise:'밑위',hemFlat:'밑단단면',headCirc:'머리둘레'};

export default function Wardrobe(){
 const [body,setBody]=useState(DEFAULT_BODY),[saved,setSaved]=useState(false),[editor,setEditor]=useState(false);
 const [outfit,setOutfit]=useState<Outfit>({top:{productId:'6170660',size:'M'},bottom:{productId:'3504218',size:'30'}});
 const [selected,setSelected]=useState('6170660'),[sizes,setSizes]=useState<Record<string,string>>({}),[notice,setNotice]=useState('');
 const [sellerProducts,setSellerProducts]=useState<Product[]>([]);
 const catalog=useMemo(()=>[...sellerProducts,...PRODUCTS],[sellerProducts]);
 const product=catalog.find(item=>item.id===selected)??PRODUCTS[0];
 const selectedSize=sizes[product.id]??(outfit[product.slot]?.productId===product.id?outfit[product.slot]?.size:product.defaultSize);
 const size=product.sizes.find(item=>item.label===selectedSize)??product.sizes.find(item=>item.label===product.defaultSize)!;
 const fit=estimateFit(body,product,size),rowRefs=useRef<Partial<Record<Slot,HTMLDivElement|null>>>({});

 useEffect(()=>{
  try{const stored=parseStoredBody(localStorage.getItem(STORAGE_KEY));if(stored){setBody(stored);setSaved(true);}}catch{}
  const syncSellerProducts=(selectFirst=false)=>{try{const next=publishedSellerCatalog(parseStoredSellerProducts(localStorage.getItem(SELLER_PRODUCTS_STORAGE_KEY)));setSellerProducts(next);if(selectFirst&&next[0])setSelected(next[0].id);}catch{setSellerProducts([]);}};
  syncSellerProducts(true);
  const handleStorage=(event:StorageEvent)=>{if(event.key===SELLER_PRODUCTS_STORAGE_KEY)syncSellerProducts();};
  window.addEventListener('storage',handleStorage);return()=>window.removeEventListener('storage',handleStorage);
 },[]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),3200);return()=>clearTimeout(timer);},[notice]);

 function lookup(id:string){return catalog.find(item=>item.id===id);}
 function equip(item:Product,label?:string){const chosen=label??sizes[item.id]??item.defaultSize;setOutfit(current=>wear(current,item,chosen));setSelected(item.id);setSizes(current=>({...current,[item.id]:chosen}));setNotice(`${SLOT_LABELS[item.slot]}를 입었어요.`);}
 function chooseSize(label:string){setSizes(current=>({...current,[product.id]:label}));if(outfit[product.slot]?.productId===product.id)setOutfit(current=>wear(current,product,label));}
 function saveBody(next:BodyProfile){setBody(next);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));setSaved(true);setNotice('이 브라우저에 내 체형을 저장했어요.');}catch{setSaved(false);setNotice('기기에 저장하지 못했어요. 이번 사용 중에는 적용됩니다.');}setEditor(false);}
 function deleteBody(){try{localStorage.removeItem(STORAGE_KEY);}catch{setNotice('저장된 체형을 삭제하지 못했어요. 브라우저 설정을 확인해 주세요.');return;}setBody(DEFAULT_BODY);setSaved(false);setNotice('저장한 체형을 삭제했어요. 기본 체형으로 돌아갑니다.');setEditor(false);}

 useWardrobeTools({body,outfit},items=>{
  setOutfit(previous=>items.reduce((current,item)=>{const found=lookup(item.productId);return found?wear(current,found,item.size):current;},previous));
  setSizes(previous=>({...previous,...Object.fromEntries(items.map(item=>[item.productId,item.size]))}));
  setSelected(items[items.length-1].productId);setNotice('선택한 옷을 입었어요.');
 });

 const sellerItem=product.source==='seller';
 return <main className="fitroom-app">
  <header className="app-header"><a className="brand" href="/" aria-label="FITROOM 역할 선택으로 이동"><span className="brand-mark"><ScanLine size={23}/></span>fitroom<span className="brand-period">.</span></a><div className="header-center"><span className="nav-active">이용자 3D 옷장</span><span className="header-divider"/>나의 체형, 나의 스타일</div><a className="body-button" href="/seller"><Sparkles size={16}/> 판매자 센터</a></header>
  <div className="page-heading"><div><span className="eyebrow">LOCAL SHOP WARDROBE</span><h1>동네 상점의 옷을, 내 체형으로.</h1></div><span className="collection-count">INDEPENDENT SHOPS <b>{String(catalog.length).padStart(2,'0')}</b></span></div>
  {sellerProducts.length>0&&<section className="seller-publication-banner"><span><Store/></span><div><strong>새로 게시된 판매자 상품 {sellerProducts.length}개</strong><p>판매자가 입력한 실측으로 예상 핏과 기본 3D 실루엣을 확인할 수 있어요.</p></div><a href="/seller/products">게시 상품 관리 <ArrowUpRight/></a></section>}
  <section className="workspace"><div className="fitting-panel"><AvatarView body={body} outfit={outfit} products={catalog} onDrop={id=>{const found=lookup(id);if(found)equip(found);}}/><div className="body-strip"><div className="body-strip-title"><span className="body-dot"/><span>{saved?'저장된 내 체형':'기본 체형'}</span><span className="body-mini">{saved?'이 브라우저에 저장됨':'내 치수로 바꿔보세요'}</span></div><div className="body-numbers"><span>키 <b>{body.measurements.height}</b><small>cm</small></span><span>가슴 <b>{body.measurements.chest}</b></span><span>허리 <b>{body.measurements.waist}</b></span><button onClick={()=>setEditor(true)} aria-label="체형 수정"><SlidersHorizontal size={15}/></button></div></div></div>
   <aside className="wardrobe-panel" aria-label="부위별 옷장"><div className="wardrobe-heading"><div><Shirt size={18}/><h2>나의 옷장</h2></div><span>끌어서 입어보기</span></div>
   {(['hat','top','bottom'] as Slot[]).map((slot,index)=>{
    const items=catalog.filter(item=>item.slot===slot);
    return <section className="closet-section" key={slot}><div className="section-heading"><h3><span>0{index+1}</span>{SLOT_LABELS[slot]}<small>{items.length}</small></h3><div className="scroll-buttons"><button aria-label={`${SLOT_LABELS[slot]} 이전 상품`} onClick={()=>rowRefs.current[slot]?.scrollBy({left:-220,behavior:'smooth'})}><ChevronLeft size={15}/></button><button aria-label={`${SLOT_LABELS[slot]} 다음 상품`} onClick={()=>rowRefs.current[slot]?.scrollBy({left:220,behavior:'smooth'})}><ChevronRight size={15}/></button></div></div><div className="product-row" ref={element=>{rowRefs.current[slot]=element;}}>{items.map(item=>{
     const worn=outfit[slot]?.productId===item.id;
     return <article key={item.id} className={`product-card ${selected===item.id?'selected':''} ${worn?'worn':''} ${item.source==='seller'?'seller-item':''}`} draggable onDragStart={event=>{event.dataTransfer.setData('text/plain',item.id);event.dataTransfer.effectAllowed='copy';}}><button className="product-photo" aria-label={`${item.brand} ${item.name} 상세 보기`} onClick={()=>setSelected(item.id)}><img src={item.image} alt={item.source==='seller'?`${SLOT_LABELS[item.slot]} 기본 3D 참고 이미지`:`${item.name} ${item.colorName}의 참고용 3D 의상`} draggable={false}/>{item.source==='seller'&&<span className="seller-item-badge">판매자 등록</span>}{worn&&<span className="wearing-badge"><Check size={11}/>착용 중</span>}<span className="swatch" style={{background:item.color}}/></button><button className="product-description" onClick={()=>setSelected(item.id)}><span>{item.brand}</span><strong>{item.name}</strong></button><button className={`wear-button ${worn?'is-worn':''}`} onClick={()=>worn?(setOutfit(current=>remove(current,slot)),setNotice(`${SLOT_LABELS[slot]}를 벗었어요.`)):equip(item)} aria-label={`${item.name} ${worn?'벗기':'입어보기'}`}>{worn?<><X size={12}/>벗기</>:<><Plus size={12}/>입어보기</>}</button></article>;
    })}</div></section>;
   })}
   <p className="catalog-note"><Info size={13}/> 상품의 색상·실루엣을 단순화한 3D 이미지예요.</p></aside>
  </section>
  <section className="selection-panel" aria-label="선택한 상품과 실측 비교"><div className="selected-product"><img src={product.image} alt=""/><div><span className="eyebrow">{sellerItem?'NEW SELLER ITEM':'LOCAL SHOP ITEM'}</span><p className="selected-brand">{product.brand}{sellerItem&&<em>판매자 등록</em>}</p><h2>{product.name}</h2><span className="color-label"><i style={{background:product.color}}/>{product.colorName}</span></div></div><div className="size-section"><div className="label-row"><h3>사이즈 선택</h3><span>{sellerItem?'판매자 입력 실측':'시연용 판매자 실측'}</span></div><div className="size-options" role="group" aria-label="상품 사이즈">{product.sizes.map(item=><button key={item.label} className={size.label===item.label?'active':''} aria-pressed={size.label===item.label} onClick={()=>chooseSize(item.label)}>{item.label}</button>)}</div><button className="text-button" onClick={()=>equip(product,size.label)}><Plus size={13}/> 이 사이즈 입어보기</button></div><div className="fit-section"><div className="label-row"><h3>예상 핏</h3><span className="estimate-badge">검증 전 추정</span></div><div className="fit-values">{[...fit.filter(item=>item.kind==='difference'),...fit.filter(item=>item.label.endsWith('총장')),...fit.filter(item=>item.kind==='unavailable'),...fit.filter(item=>item.kind==='length'&&!item.label.endsWith('총장'))].slice(0,2).map(item=><div key={item.label}><span>{item.label}</span><strong className={item.value!==null&&item.kind==='difference'&&item.value<0?'negative':''}>{item.value===null?'판단 보류':`${item.kind==='difference'&&item.value>0?'+':''}${item.value}`}<small>{item.unit}</small></strong>{item.source&&<small>{sourceLabel[item.source]}</small>}</div>)}</div></div><div className="seller-purchase"><div><strong>{product.priceKrw?.toLocaleString('ko-KR')}원</strong><span>{product.stock===0?'현재 품절':`재고 ${product.stock}개`}</span></div>{product.url?<a className="purchase-button" href={product.url} target="_blank" rel="noopener noreferrer">상점에서 구매하기<ArrowUpRight size={19}/></a>:<span className="purchase-button is-disabled">{sellerItem?'상점 링크 준비 중':'시연 상품'}</span>}</div></section>
  <details className="measurement-details"><summary><Info size={14}/> 실측 정보와 판단 근거 확인<ChevronRight size={14}/></summary><div className="measurement-content"><div><h3>상품 실측 · cm</h3><div className="measurement-table">{Object.entries(size).filter(([key,value])=>key!=='label'&&value!==undefined).map(([key,value])=><div key={key}><span>{MEASUREMENT_LABELS[key]??key}</span><b>{String(value)}</b></div>)}</div><p>{product.note}</p><span className="seller-measurement-source">실측 출처 · {sellerItem?'판매자 직접 입력':'소상공인 입점 시연 데이터'}</span><small>확인일 {product.checkedAt} · {product.url?'구매와 배송 정보는 해당 상점에서 확인하세요.':'실제 상점 연결 전 시연 상품입니다.'}</small></div><div><h3>계산 방법과 한계</h3>{fit.map(item=><p key={item.label}><b>{item.label}</b> — {item.detail}</p>)}<p>3D는 참고 실루엣입니다. 원단의 늘어남·주름·착용감을 재현하지 않으며 실제 착용 결과로 검증되지 않았어요.</p></div></div></details>
  <footer className="app-footer"><span>FITROOM · 작은 상점의 옷을 내 체형으로.</span><span>소상공인 판매자와 이용자를 잇는 가상 피팅 서비스</span></footer>
  <BodyEditor open={editor} onOpenChange={setEditor} body={body} onSave={saveBody} onDelete={deleteBody}/>{notice&&<div className="toast" role="status"><Check size={16}/>{notice}</div>}
 </main>;
}
