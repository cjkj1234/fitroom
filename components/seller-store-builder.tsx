'use client';

import {useEffect,useMemo,useState,type CSSProperties, type DragEvent} from 'react';
import Link from 'next/link';
import {Check,CheckCircle2,Eye,GripVertical,Music2,PackagePlus,Paintbrush,Plus,Save,Store,Undo2,X} from 'lucide-react';
import SellerHeader from '@/components/seller-header';
import {sellerProductToWardrobeProduct} from '@/lib/seller/catalog';
import {parseStoredSellerProducts,SELLER_CATEGORY_LABELS,SELLER_PRODUCTS_STORAGE_KEY,type SellerProduct} from '@/lib/seller/products';
import {createDefaultSellerStore,normalizeSellerStore,parseStoredSellerStore,placeSellerProduct,publishSellerStore,removeSellerProductPlacement,SELLER_STORE_MUSIC,SELLER_STORE_MUSIC_LABELS,SELLER_STORE_STORAGE_KEY,SELLER_STORE_THEME_ACCENTS,SELLER_STORE_THEME_LABELS,SELLER_STORE_THEMES,SELLER_STORE_ZONE_LABELS,SELLER_STORE_ZONES,sellerStoreReadiness,unpublishSellerStore,type SellerStoreProfile,type SellerStoreZone} from '@/lib/seller/store';

export default function SellerStoreBuilder(){
 const [products,setProducts]=useState<SellerProduct[]>([]),[profile,setProfile]=useState<SellerStoreProfile>(()=>createDefaultSellerStore());
 const [savedStoreName,setSavedStoreName]=useState('오후옷장'),[selectedZone,setSelectedZone]=useState<SellerStoreZone>('center-rack');
 const [notice,setNotice]=useState(''),[error,setError]=useState('');
 const publishedProducts=useMemo(()=>products.filter(product=>product.status==='published'),[products]);
 const publishedIds=useMemo(()=>publishedProducts.map(product=>product.id),[publishedProducts]);
 const readiness=sellerStoreReadiness(profile,publishedIds);

 useEffect(()=>{const timer=window.setTimeout(()=>{try{const storedProducts=parseStoredSellerProducts(localStorage.getItem(SELLER_PRODUCTS_STORAGE_KEY));const storedStore=parseStoredSellerStore(localStorage.getItem(SELLER_STORE_STORAGE_KEY));const storeName=storedStore?.storeName??storedProducts[0]?.storeName??'오후옷장';setProducts(storedProducts);setProfile(storedStore??createDefaultSellerStore(storeName));setSavedStoreName(storeName);}catch{}},0);return()=>window.clearTimeout(timer);},[]);
 useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),2800);return()=>window.clearTimeout(timer);},[notice]);

 function edit<K extends 'storeName'|'tagline'|'theme'|'music'|'previewConfirmed'>(key:K,value:SellerStoreProfile[K]){setProfile(previous=>({...previous,[key]:value,status:'draft',publishedAt:null}));setError('');}
 function persist(next:SellerStoreProfile,message:string){
  const now=new Date().toISOString();const normalized=normalizeSellerStore({...next,updatedAt:now},publishedIds);
  let nextProducts=products;
  if(savedStoreName!==normalized.storeName){nextProducts=products.map(product=>product.storeName===savedStoreName?{...product,storeName:normalized.storeName,updatedAt:now}:product);}
  try{localStorage.setItem(SELLER_STORE_STORAGE_KEY,JSON.stringify(normalized));localStorage.setItem(SELLER_PRODUCTS_STORAGE_KEY,JSON.stringify(nextProducts));setProfile(normalized);setProducts(nextProducts);setSavedStoreName(normalized.storeName);setNotice(message);setError('');return true;}catch{setError('브라우저에 매장 정보를 저장하지 못했어요.');return false;}
 }
 function save(){if(!profile.storeName.trim()||!profile.tagline.trim()){setError('매장 이름과 한 줄 소개를 입력해 주세요.');return;}persist(profile,'가상 매장 구성을 임시 저장했어요.');}
 function place(productId:string,zone=selectedZone){setProfile(previous=>placeSellerProduct(previous,productId,zone));setSelectedZone(zone);setNotice(`${SELLER_STORE_ZONE_LABELS[zone]}에 상품을 배치했어요.`);}
 function drop(event:DragEvent<HTMLElement>,zone:SellerStoreZone){event.preventDefault();const id=event.dataTransfer.getData('text/plain');if(publishedProducts.some(product=>product.id===id))place(id,zone);}
 function togglePublication(){
  if(profile.status==='published'){persist(unpublishSellerStore(profile),'가상 매장 게시를 내렸어요.');return;}
  const published=publishSellerStore(profile,publishedIds);if(!published){setError(`게시 준비를 완료해 주세요. 남은 단계: ${readiness.steps.filter(step=>!step.complete).map(step=>step.label).join(', ')}`);return;}persist(published,'가상 매장을 게시했어요. 이용자 상점 거리에 반영됩니다.');
 }
 function resetLayout(){setProfile(previous=>({...previous,placements:[],previewConfirmed:false,status:'draft',publishedAt:null}));setNotice('상품 배치를 초기화했어요.');}
 function productById(id:string){return products.find(product=>product.id===id);}

 return <main className="seller-app seller-store-app"><SellerHeader active="store"/><section className="seller-store-heading"><div><span className="eyebrow">VIRTUAL STORE BUILDER</span><h1>내 가상 매장</h1><p>매장의 분위기를 정하고, 게시한 상품을 원하는 진열 위치에 배치하세요.</p></div><div className="store-heading-status"><span className={profile.status}><Eye/>{profile.status==='published'?'이용자에게 공개 중':'아직 공개되지 않음'}</span><Link href="/wardrobe">상점 거리 미리보기</Link></div></section>

  <section className="store-builder-grid">
   <aside className="store-settings-panel"><div className="store-builder-title"><span><Store/></span><div><small>STORE SETTINGS</small><h2>매장 설정</h2></div></div><section><h3>매장 정보</h3><label><span>매장 이름</span><input value={profile.storeName} maxLength={40} onChange={event=>edit('storeName',event.target.value)}/></label><label><span>한 줄 소개</span><input value={profile.tagline} maxLength={80} onChange={event=>edit('tagline',event.target.value)}/><small>{profile.tagline.length}/80</small></label></section><section><h3><Paintbrush/>매장 테마</h3><div className="theme-options">{SELLER_STORE_THEMES.map(theme=><button type="button" key={theme} className={profile.theme===theme?'active':''} onClick={()=>edit('theme',theme)} style={{'--theme-color':SELLER_STORE_THEME_ACCENTS[theme]} as CSSProperties}><i/><span>{SELLER_STORE_THEME_LABELS[theme]}</span>{profile.theme===theme&&<Check/>}</button>)}</div></section><section><h3><Music2/>배경 음악</h3><select value={profile.music} onChange={event=>edit('music',event.target.value as SellerStoreProfile['music'])}>{SELLER_STORE_MUSIC.map(music=><option key={music} value={music}>{SELLER_STORE_MUSIC_LABELS[music]}</option>)}</select><p>시연 단계에서는 선택 정보만 저장하며 실제 음원은 재생하지 않습니다.</p></section><button type="button" className="store-reset-button" onClick={resetLayout}><Undo2/>상품 배치 초기화</button></aside>

   <article className={`store-preview theme-${profile.theme}`}><div className="store-preview-top"><div><span className="eyebrow">LIVE LAYOUT</span><h2>상점 미리보기</h2></div><span>상품을 끌어 진열하세요</span></div><div className="isometric-store"><div className="store-back-wall"><strong>{profile.storeName||'MY STORE'}</strong><small>{profile.tagline||'매장 소개를 입력해 주세요'}</small></div>{SELLER_STORE_ZONES.map(zone=>{const placed=profile.placements.filter(item=>item.zone===zone);return <section key={zone} className={`store-drop-zone zone-${zone} ${selectedZone===zone?'selected':''}`} onDragOver={event=>event.preventDefault()} onDrop={event=>drop(event,zone)}><button type="button" className="zone-select" onClick={()=>setSelectedZone(zone)}><span>{SELLER_STORE_ZONE_LABELS[zone]}</span><small>{placed.length}/3</small></button><div>{placed.length===0?<span className="zone-empty"><Plus/>상품 놓기</span>:placed.map(item=>{const product=productById(item.productId);return product?<span className="placed-product" key={item.productId}><img src={sellerProductToWardrobeProduct(product).image} alt=""/><small>{product.name}</small><button type="button" aria-label={`${product.name} 진열에서 제거`} onClick={()=>setProfile(previous=>removeSellerProductPlacement(previous,product.id))}><X/></button></span>:null;})}</div></section>;})}<div className="store-counter"/><div className="store-floor-lines"/></div><div className="store-preview-controls"><span><i style={{background:SELLER_STORE_THEME_ACCENTS[profile.theme]}}/>{SELLER_STORE_THEME_LABELS[profile.theme]}</span><span><Music2/>{SELLER_STORE_MUSIC_LABELS[profile.music]}</span><button type="button" onClick={()=>edit('previewConfirmed',!profile.previewConfirmed)} className={profile.previewConfirmed?'confirmed':''}>{profile.previewConfirmed?<><CheckCircle2/>미리보기 확인 완료</>:<><Eye/>이 모습으로 확인하기</>}</button></div></article>

   <aside className="store-inventory-panel"><div className="store-builder-title"><span><PackagePlus/></span><div><small>PRODUCT INVENTORY</small><h2>게시 상품</h2></div><b>{publishedProducts.length}</b></div>{publishedProducts.length===0?<div className="store-inventory-empty"><PackagePlus/><strong>게시한 상품이 없어요</strong><p>상품 관리에서 실측과 판매 정보를 완성한 뒤 옷장에 게시해 주세요.</p><Link href="/seller/products">상품 관리로 이동</Link></div>:<div className="store-inventory-list">{publishedProducts.map(product=>{const placed=profile.placements.find(item=>item.productId===product.id),visual=sellerProductToWardrobeProduct(product);return <article key={product.id} draggable onDragStart={event=>{event.dataTransfer.setData('text/plain',product.id);event.dataTransfer.effectAllowed='copy';}}><GripVertical/><img src={visual.image} alt=""/><div><small>{SELLER_CATEGORY_LABELS[product.category]} · {product.color}</small><strong>{product.name}</strong><span>{placed?SELLER_STORE_ZONE_LABELS[placed.zone]:'아직 배치하지 않음'}</span></div><button type="button" onClick={()=>place(product.id)} aria-label={`${product.name} ${SELLER_STORE_ZONE_LABELS[selectedZone]}에 배치`}><Plus/></button></article>;})}</div>}<p className="inventory-tip"><GripVertical/>카드를 끌거나 + 버튼을 눌러 선택한 구역에 배치합니다.</p></aside>
  </section>

  <section className="store-publish-bar"><div className="publish-progress"><div><strong>게시 준비</strong><span>{readiness.complete} / {readiness.total} 완료</span></div><div className="publish-track"><span style={{width:`${readiness.percent}%`}}/></div><div className="publish-checklist">{readiness.steps.map(step=><span key={step.id} className={step.complete?'complete':''}>{step.complete?<Check/>:<i/>}{step.label}</span>)}</div></div><div className="publish-actions"><button type="button" onClick={save}><Save/>임시 저장</button><button type="button" className={profile.status==='published'?'unpublish':'publish'} onClick={togglePublication}>{profile.status==='published'?'게시 내리기':'가상 매장 게시하기'}</button></div></section>
  {error&&<div className="seller-form-error store-builder-error" role="alert">{error}</div>}<footer className="seller-footer"><span>FITROOM SELLER · 가상 매장 편집기</span><span>매장 설정과 상품 배치는 계정 동기화로 다른 기기에서도 이어갈 수 있습니다.</span></footer>{notice&&<div className="toast" role="status"><Check/>{notice}</div>}
 </main>;
}
