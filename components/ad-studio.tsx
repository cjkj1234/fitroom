'use client';

import {useEffect,useRef,useState} from 'react';
import {AlertCircle,ArrowRight,BarChart3,Check,Copy,Download,FileImage,FileJson,ImagePlus,Loader2,RefreshCw,Save,Sparkles,Star,Upload} from 'lucide-react';
import {Button} from '@/components/ui/button';
import SellerHeader from '@/components/seller-header';
import {Empty,EmptyDescription,EmptyHeader,EmptyMedia,EmptyTitle} from '@/components/ui/empty';
import {Input} from '@/components/ui/input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Textarea} from '@/components/ui/textarea';
import {AD_MODEL,AD_PROMPT_VERSION,adRequestSchema,adResponseSchema,firstValidationMessage,type AdDraft,type AdRequest} from '@/lib/ads/contracts';
import {formatDraftText,parseOptionalNumberInput,safeDownloadBaseName,sellerProductToAdFields} from '@/lib/ads/client-utils';
import {AD_EVALUATIONS_STORAGE_KEY,createAdEvaluationRecord,manualAdReviewSchema,parseStoredAdEvaluations,reviewAverage,saveAdEvaluation,type ManualAdReview} from '@/lib/ads/evaluations';
import {SELLER_CATEGORY_IMAGES} from '@/lib/seller/catalog';
import {SELLER_PRODUCTS_STORAGE_KEY,parseStoredSellerProducts,type SellerProduct} from '@/lib/seller/products';

type FormState={
 storeName:string;productName:string;category:AdRequest['product']['category'];color:string;features:string;material:string;price:string;discount:string;
 audience:string;tone:AdRequest['campaign']['tone'];purpose:AdRequest['campaign']['purpose'];cta:AdRequest['campaign']['cta'];additionalRequest:string;
};
type EditableDraft=Omit<AdDraft,'hashtags'>&{hashtags:string};
type GenerationMeta={model:string;promptVersion:string;durationMs:number};
type ReviewForm={factPreservation:number;toneMatch:number;usefulness:number;notes:string};

const INITIAL_FORM:FormState={
 storeName:'오후옷장',productName:'스트라이프 반팔 티셔츠',category:'top',color:'화이트·네이비',
 features:'가로 스트라이프, 라운드넥, 여유 있는 반팔 실루엣',material:'',price:'29000',discount:'',
 audience:'일상 캐주얼 코디를 찾는 20~30대',tone:'friendly',purpose:'product_intro',cta:'view_product',additionalRequest:'과장 없이 짧고 친근하게 써 주세요.',
};
// 등록 상품 사진은 저장하지 않으므로, 사진을 고르기 전에는 카테고리에 맞는 참고 이미지를 보여 준다. 예시 상품(스트라이프 티셔츠)만 기존 이미지를 유지한다.
const SAMPLE_REFERENCE_IMAGES={...SELLER_CATEGORY_IMAGES,top:'/catalog/6170660.png'} as const;
const ANGLE_LABELS:Record<AdDraft['angle'],{number:string;title:string;description:string}>={
 product_facts:{number:'01',title:'상품 특징',description:'입력한 특징을 중심으로 소개'},
 styling:{number:'02',title:'스타일링',description:'다른 옷과의 코디 아이디어'},
 daily_scene:{number:'03',title:'일상 장면',description:'입기 좋은 상황을 제안'},
};
const REVIEW_CRITERIA:Array<{key:'factPreservation'|'toneMatch'|'usefulness';title:string;description:string}>=[
 {key:'factPreservation',title:'사실 보존',description:'입력하지 않은 소재·효능·가격을 만들지 않았나요?'},
 {key:'toneMatch',title:'톤·목적 반영',description:'선택한 고객층·말투·홍보 목적이 드러나나요?'},
 {key:'usefulness',title:'활용 가능성',description:'조금만 수정해 실제 게시물 초안으로 쓸 수 있나요?'},
];
const EMPTY_REVIEW:ReviewForm={factPreservation:0,toneMatch:0,usefulness:0,notes:''};

const nullable=(value:string)=>value.trim()||null;
function toRequest(form:FormState):AdRequest{
 return {version:1,storeName:form.storeName,product:{name:form.productName,category:form.category,color:form.color,features:form.features.split(/[,/\n]+/).map(value=>value.trim()).filter(Boolean),material:nullable(form.material),priceKrw:parseOptionalNumberInput(form.price),discountPercent:parseOptionalNumberInput(form.discount)},campaign:{channel:'instagram_post',audience:form.audience,tone:form.tone,purpose:form.purpose,cta:form.cta,additionalRequest:nullable(form.additionalRequest)}};
}
function asEditable(draft:AdDraft):EditableDraft{return {...draft,hashtags:draft.hashtags.map(tag=>`#${tag}`).join(' ')};}
function wrapText(context:CanvasRenderingContext2D,text:string,x:number,y:number,maxWidth:number,lineHeight:number){
 let line='';let cursor=y;
 for(const character of [...text]){const next=line+character;if(context.measureText(next).width>maxWidth&&line){context.fillText(line,x,cursor);line=character;cursor+=lineHeight;}else line=next;}
 if(line)context.fillText(line,x,cursor);
 return cursor+lineHeight;
}
function loadImage(src:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('image'));image.src=src;});}

export default function AdStudio(){
 const [uploadedImageUrl,setUploadedImageUrl]=useState<string|null>(null);
 const [sellerProducts,setSellerProducts]=useState<SellerProduct[]>([]);
 const [selectedProductId,setSelectedProductId]=useState('');
 const [form,setForm]=useState<FormState>(INITIAL_FORM);
 const [drafts,setDrafts]=useState<EditableDraft[]>([]);
 const [active,setActive]=useState(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [generatedFrom,setGeneratedFrom]=useState('');
 const [generationMeta,setGenerationMeta]=useState<GenerationMeta|null>(null);
 const [generatedRequest,setGeneratedRequest]=useState<AdRequest|null>(null);
 const [generatedDrafts,setGeneratedDrafts]=useState<AdDraft[]>([]);
 const [review,setReview]=useState<ReviewForm>(EMPTY_REVIEW);
 const [reviewError,setReviewError]=useState('');
 const [evaluationId,setEvaluationId]=useState('');
 const [evaluationSaved,setEvaluationSaved]=useState(false);
 const objectUrl=useRef<string|null>(null);
 useEffect(()=>()=>{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
 useEffect(()=>{try{
  const products=parseStoredSellerProducts(localStorage.getItem(SELLER_PRODUCTS_STORAGE_KEY));setSellerProducts(products);
  const id=new URLSearchParams(window.location.search).get('product');if(!id)return;
  const product=products.find(item=>item.id===id);
  if(!product){setNotice('요청한 상품을 찾지 못했어요. 목록에서 다시 골라 주세요.');return;}
  setForm(previous=>({...previous,...sellerProductToAdFields(product)}));setSelectedProductId(product.id);setNotice(`‘${product.name}’ 상품 정보를 불러왔어요.`);
 }catch{}},[]);
 const imageUrl=uploadedImageUrl??(selectedProductId?SELLER_CATEGORY_IMAGES:SAMPLE_REFERENCE_IMAGES)[form.category];
 const selectedProduct=sellerProducts.find(item=>item.id===selectedProductId);
 const sourceNote=selectedProduct?`‘${selectedProduct.name}’의 등록 정보예요. 문구용으로 고쳐도 등록 상품은 바뀌지 않아요.`:sellerProducts.length?'지금은 예시 상품 정보예요. 등록한 상품을 고르면 실제 정보로 바뀌어요.':'지금은 예시 상품 정보예요. 상품을 등록하면 여기서 바로 불러올 수 있어요.';
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),2600);return()=>clearTimeout(timer);},[notice]);
 const stale=Boolean(drafts.length&&generatedFrom&&generatedFrom!==JSON.stringify(form));
 const activeDraft=drafts[active];
 function setField<K extends keyof FormState>(key:K,value:FormState[K]){setForm(previous=>({...previous,[key]:value}));}
 // 값을 프로그램으로 바꾸면 Radix Select가 빈 값으로 onValueChange를 호출해 선택이 지워지므로 빈 값은 무시한다.
 function pick<K extends 'category'|'tone'|'purpose'|'cta'>(key:K,value:string){if(value)setField(key,value as FormState[K]);}
 function syncProductUrl(id:string){try{const url=new URL(window.location.href);if(id)url.searchParams.set('product',id);else url.searchParams.delete('product');window.history.replaceState(window.history.state,'',url);}catch{}}
 function chooseProduct(id:string){
  setSelectedProductId(id);syncProductUrl(id);
  if(!id){setForm(INITIAL_FORM);setNotice('예시 상품으로 되돌렸어요.');return;}
  const product=sellerProducts.find(item=>item.id===id);if(!product)return;
  setForm(previous=>({...previous,...sellerProductToAdFields(product)}));setNotice(`‘${product.name}’ 상품 정보를 불러왔어요.`);
 }
 function chooseImage(file?:File){
  if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('PNG, JPG, WEBP 이미지만 선택할 수 있어요.');return;}
  if(file.size>8*1024*1024){setError('이미지는 8MB 이하로 선택해 주세요.');return;}
  if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
  objectUrl.current=URL.createObjectURL(file);setUploadedImageUrl(objectUrl.current);setError('');
 }
 async function generate(){
  const candidate=toRequest(form);const validation=adRequestSchema.safeParse(candidate);
  if(!validation.success){setError(firstValidationMessage(validation.error));return;}
  const clientStartedAt=performance.now();
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/ads/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(validation.data)});
   const body:unknown=await response.json().catch(()=>null);
   if(!response.ok){const message=body&&typeof body==='object'&&'error' in body&&body.error&&typeof body.error==='object'&&'message' in body.error&&typeof body.error.message==='string'?body.error.message:'광고 문구를 만들지 못했어요. 다시 시도해 주세요.';throw new Error(message);}
   const checked=adResponseSchema.safeParse({drafts:body&&typeof body==='object'&&'drafts' in body?body.drafts:undefined});
   if(!checked.success)throw new Error('완성된 광고 문구 형식을 확인하지 못했어요. 다시 시도해 주세요.');
   const meta=body&&typeof body==='object'&&'meta' in body&&body.meta&&typeof body.meta==='object'?body.meta:null;
   const model=meta&&'model' in meta&&typeof meta.model==='string'?meta.model:AD_MODEL;
   const promptVersion=meta&&'promptVersion' in meta&&typeof meta.promptVersion==='string'?meta.promptVersion:AD_PROMPT_VERSION;
   const durationMs=meta&&'durationMs' in meta&&typeof meta.durationMs==='number'&&Number.isFinite(meta.durationMs)?Math.max(0,Math.round(meta.durationMs)):Math.max(0,Math.round(performance.now()-clientStartedAt));
   const id=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`evaluation-${Date.now()}`;
   setDrafts(checked.data.drafts.map(asEditable));setActive(0);setGeneratedFrom(JSON.stringify(form));setGeneratedRequest(validation.data);setGeneratedDrafts(checked.data.drafts);setGenerationMeta({model,promptVersion,durationMs});setReview(EMPTY_REVIEW);setReviewError('');setEvaluationId(id);setEvaluationSaved(false);
   setNotice('광고 문구 초안 3개를 만들었어요.');
  }catch(reason){setError(reason instanceof Error?reason.message:'광고 문구를 만들지 못했어요. 다시 시도해 주세요.');}
  finally{setBusy(false);}
 }
 function setReviewScore(key:'factPreservation'|'toneMatch'|'usefulness',score:number){setReview(previous=>({...previous,[key]:score}));setReviewError('');setEvaluationSaved(false);}
 function saveEvaluation(){
  const checked=manualAdReviewSchema.safeParse(review);
  if(!checked.success){setReviewError('세 평가 항목을 모두 1점부터 5점까지 선택해 주세요.');return;}
  if(!generatedRequest||generatedDrafts.length!==3||!generationMeta){setReviewError('먼저 AI 광고 문구를 생성해 주세요.');return;}
  const record=createAdEvaluationRecord({request:generatedRequest,drafts:generatedDrafts,model:generationMeta.model,promptVersion:generationMeta.promptVersion,durationMs:generationMeta.durationMs},checked.data,evaluationId||`evaluation-${Date.now()}`);
  if(!record){setReviewError('평가 기록 형식을 확인하지 못했어요. 다시 시도해 주세요.');return;}
  try{const current=parseStoredAdEvaluations(localStorage.getItem(AD_EVALUATIONS_STORAGE_KEY));localStorage.setItem(AD_EVALUATIONS_STORAGE_KEY,JSON.stringify(saveAdEvaluation(current,record)));setEvaluationSaved(true);setReviewError('');setNotice(`평가를 저장했어요. 평균 ${reviewAverage(checked.data)}점입니다.`);}catch{setReviewError('평가를 이 브라우저에 저장하지 못했어요.');}
 }
 function downloadEvaluations(){
  try{const log=parseStoredAdEvaluations(localStorage.getItem(AD_EVALUATIONS_STORAGE_KEY));if(log.records.length===0){setReviewError('먼저 평가를 한 건 이상 저장해 주세요.');return;}const blob=new Blob([JSON.stringify(log,null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='fitroom-ai-model-evaluations.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice(`평가 기록 ${log.records.length}건을 JSON으로 저장했어요.`);}catch{setReviewError('평가 기록 파일을 만들지 못했어요.');}
 }
 function updateDraft<K extends keyof EditableDraft>(key:K,value:EditableDraft[K]){setDrafts(previous=>previous.map((draft,index)=>index===active?{...draft,[key]:value}:draft));}
 async function copyDraft(){if(!activeDraft)return;try{await navigator.clipboard.writeText(formatDraftText(activeDraft));setNotice('선택한 문구를 복사했어요.');}catch{setNotice('복사하지 못했어요. 문구를 직접 선택해 주세요.');}}
 function downloadText(){if(!activeDraft)return;const blob=new Blob([formatDraftText(activeDraft)],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`${safeDownloadBaseName(form.productName)}-광고문구.txt`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('TXT 파일을 저장했어요.');}
 async function downloadPng(){
  if(!activeDraft)return;
  try{
   const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const context=canvas.getContext('2d');if(!context)throw new Error('canvas');
   context.fillStyle='#f4f4f5';context.fillRect(0,0,1080,1350);context.fillStyle='#ffffff';context.fillRect(60,60,960,1230);
   const image=await loadImage(imageUrl);const scale=Math.min(840/image.width,590/image.height);const width=image.width*scale,height=image.height*scale;context.drawImage(image,540-width/2,105+(590-height)/2,width,height);
   if(!uploadedImageUrl){context.fillStyle='#8a8d94';context.font='20px Arial';context.fillText('참고 이미지 · 실제 상품과 다를 수 있어요',120,718);}
   context.fillStyle='#2557d6';context.font='700 24px Arial';context.fillText(form.storeName.toUpperCase(),120,760);
   context.fillStyle='#202227';context.font='700 48px Arial';let y=wrapText(context,activeDraft.headline,120,830,840,62);
   context.fillStyle='#555961';context.font='28px Arial';y=wrapText(context,activeDraft.body,120,y+22,840,43);
   context.fillStyle='#202227';context.font='700 27px Arial';y=wrapText(context,activeDraft.cta,120,y+22,840,42);
   context.fillStyle='#2557d6';context.font='24px Arial';wrapText(context,activeDraft.hashtags,120,y+18,840,36);
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('blob');const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`${safeDownloadBaseName(form.productName)}-광고카드.png`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('PNG 광고 카드를 저장했어요.');
  }catch{setNotice('PNG를 만들지 못했어요. 다른 이미지를 선택해 다시 시도해 주세요.');}
 }
 return <main className="ad-app">
  <SellerHeader active="ads"/>
  <section className="ad-hero"><div><span className="eyebrow">AI COPY WORKBENCH</span><h1>상품의 매력을 광고 문구로 바꿔보세요.</h1><p>확인된 상품 정보만 사용해 서로 다른 관점의 초안 3개를 만듭니다.</p></div><div className="ad-step"><b>01</b><span>정보 입력</span><i/><b>02</b><span>AI 생성</span><i/><b>03</b><span>편집·저장</span></div></section>
  <form className="ad-workspace" onSubmit={event=>{event.preventDefault();void generate();}}>
   <section className="ad-card product-visual-card" aria-labelledby="visual-title"><div className="ad-card-heading"><span>01</span><div><h2 id="visual-title">상품 이미지</h2><p>이미지는 브라우저 미리보기에만 사용돼요.</p></div></div><div className="product-visual"><img src={imageUrl} alt={uploadedImageUrl?'광고 문구를 만들 상품 미리보기':'카테고리에 맞춘 참고 이미지'}/><span>{uploadedImageUrl?'내 상품 이미지':'참고 이미지'}</span></div><label className="image-upload"><Upload size={16}/><span>내 상품 이미지 선택</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>chooseImage(event.target.files?.[0])}/></label><p className="privacy-copy">사진은 AI에 전송하거나 저장하지 않습니다.</p>{!uploadedImageUrl&&<p className="reference-note">지금 이미지는 카테고리에 맞춘 참고 이미지예요. 실제 상품 사진을 고르면 광고 카드에 그 사진이 들어가요.</p>}</section>
   <section className="ad-card product-form-card" aria-labelledby="product-title"><div className="ad-card-heading"><span>02</span><div><h2 id="product-title">상품과 광고 정보</h2><p><em>*</em> 표시는 필수 입력입니다.</p></div></div><div className="ad-source"><label htmlFor="ad-product-select">등록 상품에서 불러오기</label>{sellerProducts.length>0&&<select id="ad-product-select" value={selectedProductId} onChange={event=>chooseProduct(event.target.value)}><option value="">예시 상품으로 연습하기</option>{sellerProducts.map(product=><option key={product.id} value={product.id}>{product.name} · {product.storeName}</option>)}</select>}<p>{sourceNote}{sellerProducts.length===0&&<> <a href="/seller/products">상품 등록하기</a></>}</p></div><div className="ad-fields"><label><span>상점명 <em>*</em></span><Input value={form.storeName} onChange={event=>setField('storeName',event.target.value)} maxLength={40}/></label><label><span>상품명 <em>*</em></span><Input value={form.productName} onChange={event=>setField('productName',event.target.value)} maxLength={80}/></label><div className="field-pair"><label><span>카테고리 <em>*</em></span><Select value={form.category} onValueChange={value=>pick('category',value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="top">상의</SelectItem><SelectItem value="bottom">하의</SelectItem><SelectItem value="hat">모자</SelectItem></SelectContent></Select></label><label><span>색상 <em>*</em></span><Input value={form.color} onChange={event=>setField('color',event.target.value)} maxLength={40}/></label></div><label><span>핵심 특징 <em>*</em></span><Textarea value={form.features} onChange={event=>setField('features',event.target.value)} maxLength={504}/><small>쉼표로 구분해 최대 5가지를 적어주세요. 확인한 사실만 사용합니다.</small></label><label><span>소재</span><Input value={form.material} onChange={event=>setField('material',event.target.value)} placeholder="예: 면 100% · 확인한 경우에만 입력" maxLength={100}/></label><div className="field-pair"><label><span>판매가</span><Input inputMode="numeric" value={form.price} onChange={event=>setField('price',event.target.value)} placeholder="예: 29000"/><small>원 단위 숫자</small></label><label><span>할인율</span><Input inputMode="numeric" value={form.discount} onChange={event=>setField('discount',event.target.value)} placeholder="예: 10"/><small>할인 홍보 선택 시 필수</small></label></div><div className="ad-rule"/><label><span>주요 고객 <em>*</em></span><Input value={form.audience} onChange={event=>setField('audience',event.target.value)} maxLength={80}/></label><div className="field-pair"><label><span>말투 <em>*</em></span><Select value={form.tone} onValueChange={value=>pick('tone',value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="friendly">친근하고 자연스럽게</SelectItem><SelectItem value="minimal">간결하고 담백하게</SelectItem><SelectItem value="energetic">밝고 활기차게</SelectItem></SelectContent></Select></label><label><span>광고 목적 <em>*</em></span><Select value={form.purpose} onValueChange={value=>pick('purpose',value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="product_intro">상품 소개</SelectItem><SelectItem value="new_arrival">신상품 소개</SelectItem><SelectItem value="promotion">할인 홍보</SelectItem></SelectContent></Select></label></div><label><span>마지막 안내 <em>*</em></span><Select value={form.cta} onValueChange={value=>pick('cta',value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="view_product">상품 보기</SelectItem><SelectItem value="visit_store">매장 방문</SelectItem><SelectItem value="inquire">문의하기</SelectItem></SelectContent></Select></label><label><span>추가 요청</span><Textarea value={form.additionalRequest} onChange={event=>setField('additionalRequest',event.target.value)} placeholder="예: 출근룩과 주말 코디를 함께 제안해 주세요." maxLength={300}/></label></div>{error&&<div className="ad-error" role="alert"><AlertCircle/>{error}</div>}<Button type="submit" className="generate-button" disabled={busy}>{busy?<><Loader2 className="spin"/>문구를 만들고 있어요</>:<><Sparkles/>AI 광고 문구 3개 만들기<ArrowRight/></>}</Button><p className="generate-note">입력한 사실을 넘어서는 효능이나 소재 정보는 만들지 않습니다.</p></section>
   <section className="ad-card results-card" aria-labelledby="result-title"><div className="ad-card-heading result-heading"><span>03</span><div><h2 id="result-title">광고 문구 초안</h2><p>생성 후 바로 고쳐 쓰고 저장할 수 있어요.</p></div>{drafts.length>0&&<span className="generated-badge"><Check/>초안 3개</span>}</div>{busy&&drafts.length===0?<div className="generation-state" role="status"><Loader2 className="spin"/><h3>상품 정보를 읽고 있어요</h3><p>세 가지 관점의 문구를 만드는 중입니다.</p></div>:drafts.length===0?<Empty className="result-empty"><EmptyHeader><EmptyMedia variant="icon"><ImagePlus/></EmptyMedia><EmptyTitle>아직 만든 문구가 없어요</EmptyTitle><EmptyDescription>상품 정보를 확인한 뒤 생성 버튼을 누르면<br/>서로 다른 관점의 초안 3개가 여기에 표시됩니다.</EmptyDescription></EmptyHeader><div className="empty-angles"><span>상품 특징</span><span>스타일링</span><span>일상 장면</span></div></Empty>:<><div className="draft-tabs" role="tablist" aria-label="광고 초안">{drafts.map((draft,index)=>{const label=ANGLE_LABELS[draft.angle];return <button type="button" role="tab" aria-selected={active===index} className={active===index?'active':''} key={draft.angle} onClick={()=>setActive(index)}><b>{label.number}</b><span>{label.title}<small>{label.description}</small></span></button>;})}</div>{stale&&<div className="stale-note"><RefreshCw/>상품 정보가 바뀌었어요. 현재 편집 내용은 유지되며, 재생성하면 새 정보가 반영됩니다.</div>}<div className="draft-editor"><div className="draft-label-row"><span>{ANGLE_LABELS[activeDraft.angle].title} 초안</span><small>{generationMeta?.model??'AI 생성'} · 게시 전 확인 필요</small></div><label><span>제목 <small>{[...activeDraft.headline].length}/40</small></span><Input value={activeDraft.headline} onChange={event=>updateDraft('headline',event.target.value)} maxLength={40}/></label><label><span>본문 <small>{[...activeDraft.body].length}/220</small></span><Textarea value={activeDraft.body} onChange={event=>updateDraft('body',event.target.value)} maxLength={220}/></label><label><span>마지막 안내 <small>{[...activeDraft.cta].length}/40</small></span><Input value={activeDraft.cta} onChange={event=>updateDraft('cta',event.target.value)} maxLength={40}/></label><label><span>해시태그</span><Textarea className="hashtag-editor" value={activeDraft.hashtags} onChange={event=>updateDraft('hashtags',event.target.value)} maxLength={150}/></label></div><div className="result-actions"><Button type="button" variant="outline" onClick={()=>void copyDraft()}><Copy/>복사</Button><Button type="button" variant="outline" onClick={downloadText}><Download/>TXT</Button><Button type="button" onClick={()=>void downloadPng()}><FileImage/>PNG 카드</Button></div></>}</section>
   <section className="ad-card ad-evaluation-card" aria-labelledby="evaluation-title"><div className="ad-card-heading"><span>04</span><div><h2 id="evaluation-title">AI 생성 품질 평가</h2><p>생성 직후 원본을 입력과 비교해 1점부터 5점까지 기록합니다.</p></div>{evaluationSaved&&<span className="evaluation-saved"><Check/>평가 저장됨</span>}</div>{drafts.length===0?<div className="evaluation-empty"><BarChart3/><div><strong>광고 문구를 생성하면 평가가 열려요</strong><p>모델명·프롬프트 버전·응답 시간과 사람 평가를 함께 보관합니다.</p></div></div>:<><div className="evaluation-meta"><span><small>MODEL</small><strong>{generationMeta?.model??AD_MODEL}</strong></span><span><small>PROMPT</small><strong>{generationMeta?.promptVersion??AD_PROMPT_VERSION}</strong></span><span><small>RESPONSE</small><strong>{generationMeta?`${generationMeta.durationMs.toLocaleString('ko-KR')}ms`:'측정 전'}</strong></span><span><small>AVERAGE</small><strong>{review.factPreservation&&review.toneMatch&&review.usefulness?`${reviewAverage(review as ManualAdReview)} / 5`:'평가 전'}</strong></span></div><div className="evaluation-grid"><div className="evaluation-criteria">{REVIEW_CRITERIA.map(criterion=><section key={criterion.key}><div><strong>{criterion.title}</strong><p>{criterion.description}</p></div><div className="score-buttons" role="group" aria-label={`${criterion.title} 점수`}>{[1,2,3,4,5].map(score=><button type="button" key={score} className={review[criterion.key]===score?'active':''} aria-pressed={review[criterion.key]===score} onClick={()=>setReviewScore(criterion.key,score)}><Star fill={review[criterion.key]>=score?'currentColor':'none'}/><span>{score}</span></button>)}</div></section>)}</div><label className="evaluation-notes"><span>평가 메모 <small>{review.notes.length}/500</small></span><Textarea value={review.notes} onChange={event=>{setReview(previous=>({...previous,notes:event.target.value}));setEvaluationSaved(false);}} maxLength={500} placeholder="과장 표현, 잘 반영된 말투, 수정이 필요한 문장을 구체적으로 기록해 주세요."/><p>화면에서 수정한 문구가 아니라 AI가 처음 생성한 원본을 평가 기록에 저장합니다.</p></label></div>{reviewError&&<div className="evaluation-error" role="alert"><AlertCircle/>{reviewError}</div>}<div className="evaluation-actions"><Button type="button" onClick={saveEvaluation}><Save/>평가 저장</Button><Button type="button" variant="outline" onClick={downloadEvaluations}><FileJson/>전체 평가 JSON</Button><span>최대 50건 · 현재 브라우저에만 저장</span></div></>}</section>
  </form>
  <footer className="ad-footer"><span>FITROOM · 작은 의류 상점을 위한 AI 광고 스튜디오</span><span>생성 결과는 게시 전 판매자가 직접 확인해 주세요.</span></footer>{notice&&<div className="toast" role="status"><Check size={16}/>{notice}</div>}
 </main>;
}
