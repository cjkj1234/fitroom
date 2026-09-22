'use client';

import {useEffect} from 'react';
import {Heart,RotateCcw,ShoppingBag,Trash2,X} from 'lucide-react';
import {SLOT_LABELS} from '@/lib/wardrobe/catalog';
import type {SavedLook,WardrobeCollection} from '@/lib/wardrobe/collection';
import type {Product,Slot} from '@/lib/wardrobe/types';

const SLOT_ORDER:Slot[]=['hat','top','bottom'];

type Props={
 open:boolean;
 collection:WardrobeCollection;
 products:Product[];
 onClose:()=>void;
 onSelectProduct:(productId:string)=>void;
 onToggleFavorite:(productId:string)=>void;
 onRestoreLook:(look:SavedLook)=>void;
 onRemoveLook:(id:string)=>void;
};

export default function WardrobeCollection({open,collection,products,onClose,onSelectProduct,onToggleFavorite,onRestoreLook,onRemoveLook}:Props){
 useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[open,onClose]);
 if(!open)return null;
 const byId=(id:string)=>products.find(product=>product.id===id);
 return <div className="collection-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><aside className="collection-drawer" role="dialog" aria-modal="true" aria-labelledby="collection-title"><header><div><span>MY FIT COLLECTION</span><h2 id="collection-title">찜·코디 보관함</h2><p>마음에 든 상품과 지금 입은 코디를 다시 꺼내보세요.</p></div><button type="button" onClick={onClose} aria-label="보관함 닫기"><X/></button></header><div className="collection-scroll"><section><div className="collection-section-title"><h3><Heart/>찜한 상품</h3><span>{collection.favoriteProductIds.length}</span></div>{collection.favoriteProductIds.length===0?<div className="collection-empty"><Heart/><strong>아직 찜한 상품이 없어요</strong><p>상품 상세에서 하트를 눌러 모아보세요.</p></div>:<div className="favorite-list">{collection.favoriteProductIds.map(id=>{const item=byId(id);return <article key={id}>{item?<button type="button" className="favorite-product" onClick={()=>onSelectProduct(id)}><img src={item.image} alt=""/><span><small>{item.brand} · {SLOT_LABELS[item.slot]}</small><strong>{item.name}</strong><em>{item.priceKrw?`${item.priceKrw.toLocaleString('ko-KR')}원`:'시연 상품'}</em></span></button>:<div className="favorite-product unavailable"><span><small>판매 종료</small><strong>현재 매장에서 찾을 수 없는 상품</strong></span></div>}<button type="button" className="collection-remove" onClick={()=>onToggleFavorite(id)} aria-label={`${item?.name??'판매 종료 상품'} 찜 해제`}><Trash2/></button></article>;})}</div>}</section><section><div className="collection-section-title"><h3><ShoppingBag/>저장한 코디</h3><span>{collection.looks.length}</span></div>{collection.looks.length===0?<div className="collection-empty"><ShoppingBag/><strong>저장한 코디가 없어요</strong><p>피팅룸에서 옷을 입고 현재 코디를 저장해 보세요.</p></div>:<div className="saved-look-list">{collection.looks.map(look=><article key={look.id}><div><small>{new Date(look.savedAt).toLocaleDateString('ko-KR')}</small><strong>{look.name}</strong><div>{SLOT_ORDER.flatMap(slot=>{const worn=look.outfit[slot];if(!worn)return[];const item=byId(worn.productId);return <span key={slot}><b>{SLOT_LABELS[slot]}</b>{item?.name??'판매 종료 상품'} · {worn.size}</span>;})}</div></div><div><button type="button" className="restore-look" onClick={()=>onRestoreLook(look)}><RotateCcw/>다시 입기</button><button type="button" className="collection-remove" onClick={()=>onRemoveLook(look.id)} aria-label={`${look.name} 삭제`}><Trash2/></button></div></article>)}</div>}</section></div><footer><span>상품 {collection.favoriteProductIds.length}</span><span>코디 {collection.looks.length}</span><button type="button" onClick={onClose}>계속 둘러보기</button></footer></aside></div>;
}
