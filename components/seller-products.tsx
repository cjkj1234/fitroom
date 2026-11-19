'use client';

import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Eye,EyeOff,ImagePlus,PackagePlus,Pencil,Plus,Sparkles,Trash2,Upload,X} from 'lucide-react';
import SellerHeader from '@/components/seller-header';
import {parseOptionalNumberInput} from '@/lib/ads/client-utils';
import {analyzeProductPhoto,type CutoutMethod,type PhotoAnalysis,type PreparedPhoto} from '@/lib/seller/photo-prepare';
import {MATTING_MODEL,computeMatte,mattingSupport,type MattingProgress,type MattingSupport} from '@/lib/seller/photo-matting';
import {deleteStoredPhotos,saveStoredPhotos} from '@/lib/seller/photo-store';
import {newPhotoVersion} from '@/lib/seller/photo-files';
import type {BottomSilhouette,TopSilhouette} from '@/lib/seller/photo-silhouette';
import {SELLER_CATEGORIES,SELLER_CATEGORY_LABELS,SELLER_MEASUREMENT_FIELDS,SELLER_MEASUREMENT_KEYS,SELLER_MEASUREMENT_MAX_CM,SELLER_PRODUCTS_STORAGE_KEY,describeSellerProductIssue,emptySellerSize,isReservedStoreName,normalizeSellerProductPublication,parseStoredSellerProducts,productReadiness,publishSellerProduct,reservedStoreNameMessage,sellerProductSchema,unpublishSellerProduct,upsertSellerProduct,type SellerCategory,type SellerMeasurementKey,type SellerProduct,type SellerSize} from '@/lib/seller/products';

type SizeForm={label:string}&Record<SellerMeasurementKey,string>;
type ProductForm={storeName:string;name:string;category:SellerCategory;color:string;colorHex:string;features:string;material:string;price:string;stock:string;purchaseUrl:string;sizes:SizeForm[]};
const emptySizeForm=(label=''):SizeForm=>({label,length:'',chestFlat:'',shoulder:'',sleeve:'',waistFlat:'',hipsFlat:'',thighFlat:'',rise:'',headCirc:''});
// 판매자가 AI 배경 제거를 켰는지(모델을 받기로 했는지) 이 브라우저에 기억한다. 켜 두면 다음 사진부터 자동으로 쓴다.
const AI_CUTOUT_KEY='fitroom.seller.ai-cutout.v1';
const unreadable:PreparedPhoto={photo:null,reason:'사진을 읽지 못했어요',top:'사진을 읽지 못했어요',bottom:'사진을 읽지 못했어요'};
const INITIAL_FORM:ProductForm={storeName:'',name:'',category:'top',color:'',colorHex:'',features:'',material:'',price:'',stock:'',purchaseUrl:'',sizes:[emptySizeForm('M')]};

function optionalDecimal(value:string){const clean=value.trim();if(!clean)return null;if(!/^\d+(?:\.\d{1,2})?$/.test(clean))return Number.NaN;return Number(clean);}
// 사진에서 잰 몸판 실루엣을 작은 윤곽 그림으로 보여 준다(위가 겨드랑이, 아래가 밑단).
function ShapePreview({shape}:{shape:TopSilhouette}){
 const half=(ratio:number)=>ratio*18,height=Math.min(70,Math.max(30,shape.lengthToChest*(1-shape.armpit)*36)),rows=shape.bodyWidths.map((ratio,i)=>[half(ratio),8+height*i/(shape.bodyWidths.length-1)] as const);
 const outline=[...rows.map(([w,y])=>`${30+w},${y}`),...[...rows].reverse().map(([w,y])=>`${30-w},${y}`)].join(' ');
 return <svg className="seller-shape-preview" viewBox="0 0 60 86" aria-hidden="true"><polygon points={outline}/><line x1="8" x2="52" y1="8" y2="8"/></svg>;
}
// 바지 사진에서 잰 실루엣: 허리선·엉덩이와 두 다리(가랑이에서 밑단까지 다리 폭 비율)를 작은 윤곽 그림으로 보여 준다.
function LegShapePreview({shape}:{shape:BottomSilhouette}){
 const waist=12,hip=waist*shape.hipToWaist,top=8,height=Math.min(72,Math.max(30,shape.lengthToWaist*24)),crotch=top+height*shape.rise,last=shape.legWidths.length-1,hipY=top+(crotch-top)*.6;
 const legs=shape.legWidths.map((ratio,i)=>({width:hip*ratio,gap:1+2*i/last,y:crotch+(top+height-crotch)*i/last}));
 const points=[[30-waist,top],[30+waist,top],[30+hip,hipY],...legs.map(l=>[30+l.gap+l.width,l.y]),...[...legs].reverse().map(l=>[30+l.gap,l.y]),[30,crotch],...legs.map(l=>[30-l.gap,l.y]),...[...legs].reverse().map(l=>[30-l.gap-l.width,l.y]),[30-hip,hipY]];
 return <svg className="seller-shape-preview" viewBox="0 0 60 86" aria-hidden="true"><polygon points={points.map(([x,y])=>`${x},${y}`).join(' ')}/><line x1="8" x2="52" y1={top} y2={top}/></svg>;
}
function toSizeForm(size:SellerSize):SizeForm{return {label:size.label,...Object.fromEntries(SELLER_MEASUREMENT_KEYS.map(key=>[key,size[key]===null?'':String(size[key])]))} as SizeForm;}

export default function SellerProducts(){
 const [products,setProducts]=useState<SellerProduct[]>([]),[form,setForm]=useState<ProductForm>(INITIAL_FORM),[editingId,setEditingId]=useState<string|null>(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[imageUrl,setImageUrl]=useState<string|null>(null),[photoColors,setPhotoColors]=useState<string[]>([]);
 // 상품 사진(앞·뒤): 고른 사진을 자르고 3D에 입힐 수 있는지 확인한 결과. usePhotos를 켜고 저장하면 이 브라우저에 저장한다.
 // savedPhoto: 수정 중인 상품에 이미 저장된 사진 표시. 새 앞 사진을 고르지 않으면 keepSavedPhoto에 따라 유지하거나 지운다.
 const [frontPhoto,setFrontPhoto]=useState<PreparedPhoto|null>(null),[backPhoto,setBackPhoto]=useState<PreparedPhoto|null>(null),[preparing,setPreparing]=useState(false),[usePhotos,setUsePhotos]=useState(true);
 const [savedPhoto,setSavedPhoto]=useState<SellerProduct['photo']>(null),[keepSavedPhoto,setKeepSavedPhoto]=useState(true);const backInput=useRef<HTMLInputElement|null>(null);
 const [legCandidate,setLegCandidate]=useState<BottomSilhouette|null>(null),[legReason,setLegReason]=useState(''),[savedLegShape,setSavedLegShape]=useState<BottomSilhouette|null>(null);
 const [shapeCandidate,setShapeCandidate]=useState<TopSilhouette|null>(null),[shapeReason,setShapeReason]=useState(''),[useShape,setUseShape]=useState(true),[savedShape,setSavedShape]=useState<TopSilhouette|null>(null),[keepSavedShape,setKeepSavedShape]=useState(true);const objectUrl=useRef<string|null>(null),imageInput=useRef<HTMLInputElement|null>(null),imageAnalysisId=useRef(0);
 // AI 배경 제거(photo-matting.ts): 이 브라우저에서 쓸 수 있는지(ai), 판매자가 켰는지(aiOptIn), 진행 상황, 실패 안내, 지금 사진에 쓴 방법.
 // backFile: AI를 켰을 때 뒷면 사진도 다시 분석하려고 고른 파일을 둔다. autoColor: 사진에서 자동으로 채운 3D 색(판매자가 바꾸지 않았으면 새 분석 결과로 바꾼다).
 const [ai,setAi]=useState<MattingSupport|'checking'>('checking'),[aiOptIn,setAiOptIn]=useState(false),[aiProgress,setAiProgress]=useState(''),[aiNote,setAiNote]=useState(''),[cutoutMethod,setCutoutMethod]=useState<CutoutMethod|null>(null);
 const backFile=useRef<File|null>(null),autoColor=useRef('');
 const autoAi=ai==='cached'||(ai==='download'&&aiOptIn);
 useEffect(()=>{let active=true;queueMicrotask(()=>{if(!active)return;try{setAiOptIn(localStorage.getItem(AI_CUTOUT_KEY)==='on');}catch{}});void mattingSupport().then(value=>{if(active)setAi(value);});return()=>{active=false;};},[]);
 useEffect(()=>{let active=true;queueMicrotask(()=>{if(!active)return;try{const stored=parseStoredSellerProducts(localStorage.getItem(SELLER_PRODUCTS_STORAGE_KEY));setProducts(stored);setForm(previous=>previous.storeName||!stored[0]?previous:{...previous,storeName:stored[0].storeName});}catch{}});return()=>{active=false;};},[]);
 useEffect(()=>()=>{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),2600);return()=>clearTimeout(timer);},[notice]);
 const fields=SELLER_MEASUREMENT_FIELDS[form.category];
 function setField<K extends keyof Omit<ProductForm,'sizes'>>(key:K,value:ProductForm[K]){setForm(previous=>({...previous,[key]:value}));}
 function setSize(index:number,key:keyof SizeForm,value:string){setForm(previous=>({...previous,sizes:previous.sizes.map((size,row)=>row===index?{...size,[key]:value}:size)}));}
 function clearImageState(){imageAnalysisId.current+=1;setPhotoColors([]);setFrontPhoto(null);setBackPhoto(null);setUsePhotos(true);setPreparing(false);backFile.current=null;autoColor.current='';setCutoutMethod(null);setAiNote('');setAiProgress('');if(backInput.current)backInput.current.value='';setShapeCandidate(null);setShapeReason('');setLegCandidate(null);setLegReason('');setUseShape(true);if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current=null;setImageUrl(null);if(imageInput.current)imageInput.current.value='';}
 function chooseImage(file?:File){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('PNG, JPG, WEBP 이미지만 선택할 수 있어요.');return;}if(file.size>8*1024*1024){setError('이미지는 8MB 이하로 선택해 주세요.');return;}if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current=URL.createObjectURL(file);setImageUrl(objectUrl.current);setError('');setPhotoColors([]);setFrontPhoto(null);setUsePhotos(true);setShapeCandidate(null);setShapeReason('');setLegCandidate(null);setLegReason('');setUseShape(true);setCutoutMethod(null);
  analyzeFront(autoAi);}
 // 뒷면 사진(선택). 앞 사진과 따로 자르고 확인한다.
 function chooseBackImage(file?:File){
  if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){setError('뒷면 사진은 8MB 이하의 PNG, JPG, WEBP 이미지로 골라 주세요.');return;}
  backFile.current=file;analyzeBack(autoAi);
 }
 // 판매자가 AI 배경 제거를 켜면 기억해 두고(다음 사진부터 자동), 지금 고른 앞·뒤 사진을 다시 분석한다.
 function enableAi(){try{localStorage.setItem(AI_CUTOUT_KEY,'on');}catch{}setAiOptIn(true);analyzeFront(true);analyzeBack(true);}
 function showAiProgress(value:MattingProgress){setAiProgress(value.phase==='download'?`AI 모델을 받고 있어요 ${Math.floor(value.loaded/value.total*100)}% (처음 한 번만)`:value.phase==='prepare'?'AI 모델을 준비하고 있어요…':'AI가 사진에서 옷만 잘라내고 있어요…');}
 // 사진 한 장 분석: 옷 윤곽(AI 배경 제거 또는 배경색)으로 대표색·실루엣을 재고 옷 둘레로 자른다(원본 사진은 저장하지 않는다).
 // AI가 실패하면 이유를 알리고 배경색 방식으로 다시 한다.
 async function analyzePhoto(source:string,withAi:boolean):Promise<PhotoAnalysis|null>{
  if(withAi){
   try{const result=await analyzeProductPhoto(source,shoulderRatio(),image=>computeMatte(image,showAiProgress));setAi(previous=>previous==='download'?'cached':previous);return result;}
   catch(problem){setAiNote(`AI 배경 제거를 하지 못해 배경색으로 옷을 찾았어요${problem instanceof Error&&problem.message?`(${problem.message})`:''}.`);}
   finally{setAiProgress('');}
  }
  return analyzeProductPhoto(source,shoulderRatio()).catch(()=>null);
 }
 function analyzeFront(withAi:boolean){
  const source=objectUrl.current;if(!source)return;const analysisId=++imageAnalysisId.current;setPreparing(true);setAiNote('');
  void analyzePhoto(source,withAi).then(result=>{
   if(analysisId!==imageAnalysisId.current)return;setPreparing(false);
   if(!result){setFrontPhoto(unreadable);setShapeReason(unreadable.reason);setLegReason(unreadable.reason);return;}
   setCutoutMethod(result.method);setFrontPhoto(result.prepared);setPhotoColors(result.colors);
   // 대표색: 색이 비어 있거나 앞서 사진에서 자동으로 채운 색 그대로면 새 결과의 가장 큰 덩어리 색으로 바꾼다.
   const suggested=result.colors[0],previousAuto=autoColor.current;
   if(suggested){autoColor.current=suggested;setForm(previous=>previous.colorHex&&previous.colorHex!==previousAuto?previous:{...previous,colorHex:suggested});}
   // 같은 윤곽에서 잰 상의 몸판·바지 다리 실루엣 비율(카테고리를 나중에 바꿀 수 있어 둘 다). 사진이 아니라 숫자만 상품 정보에 저장한다.
   setShapeCandidate(result.top.silhouette);setShapeReason(result.top.reason);setLegCandidate(result.bottom.silhouette);setLegReason(result.bottom.reason);
  });
 }
 function analyzeBack(withAi:boolean){
  const file=backFile.current;if(!file)return;const url=URL.createObjectURL(file),analysisId=imageAnalysisId.current;setBackPhoto(null);
  void analyzePhoto(url,withAi).then(result=>{URL.revokeObjectURL(url);if(analysisId===imageAnalysisId.current)setBackPhoto(result?.prepared??unreadable);});
 }
 // 상의 어깨너비 ÷ 가슴단면(첫 사이즈 실측). 사진에서 어깨점 위치를 정하는 데 쓴다.
 function shoulderRatio(){const size=form.sizes[0],shoulder=Number(size?.shoulder),chest=Number(size?.chestFlat);return shoulder>0&&chest>0?shoulder/chest:.92;}
 const photoCategory=form.category==='top'||form.category==='bottom'?form.category:null;
 const photoProblem=(prepared:PreparedPhoto|null)=>!prepared?null:!photoCategory?'모자는 사진을 입히지 않아요':prepared.photo?prepared[photoCategory]:prepared.reason;
 function persist(next:SellerProduct[]){setProducts(next);try{localStorage.setItem(SELLER_PRODUCTS_STORAGE_KEY,JSON.stringify(next));return true;}catch{return false;}}
 function resetForm(){clearImageState();setSavedPhoto(null);setKeepSavedPhoto(true);setSavedShape(null);setSavedLegShape(null);setKeepSavedShape(true);setForm(previous=>({...INITIAL_FORM,storeName:previous.storeName,sizes:[emptySizeForm('M')]}));setEditingId(null);setError('');}
 function saveProduct(){
  if(!form.storeName.trim()||!form.name.trim()||!form.color.trim()){setError('상점명, 상품명, 색상을 모두 입력해 주세요.');return;}
  if(isReservedStoreName(form.storeName)){setError(reservedStoreNameMessage(form.storeName));return;}
  const features=form.features.split(/[,/\n]+/).map(value=>value.trim()).filter(Boolean);if(features.length<1||features.length>5){setError('핵심 특징을 1개 이상 5개 이하로 입력해 주세요.');return;}
  const price=parseOptionalNumberInput(form.price),stock=parseOptionalNumberInput(form.stock);if(Number.isNaN(price)){setError('판매가는 원 단위 숫자로 입력해 주세요.');return;}if(Number.isNaN(stock)){setError('재고는 숫자로 입력해 주세요.');return;}
  const purchaseUrl=form.purchaseUrl.trim();if(purchaseUrl&&!/^https?:\/\/[^\s]+$/i.test(purchaseUrl)){setError('구매 링크는 http:// 또는 https://로 시작하는 주소를 입력해 주세요.');return;}
  const sizes:SellerSize[]=[];
  for(const row of form.sizes){
   const hasMeasurement=fields.some(field=>row[field.key].trim());if(!row.label.trim()&&!hasMeasurement)continue;if(!row.label.trim()){setError('실측값을 입력한 행에는 사이즈 이름이 필요해요.');return;}
   const size=emptySellerSize(row.label.trim());
   // 카테고리를 바꾸면 화면에 없는 칸의 값이 상태에 남아 있으므로, 현재 카테고리의 칸만 저장한다.
   for(const field of fields){const value=optionalDecimal(row[field.key]);if(Number.isNaN(value)){setError(`${row.label.trim()} 사이즈의 ${field.label} 값은 cm 숫자(소수 둘째 자리까지)로 입력해 주세요.`);return;}if(value!==null&&(value<=0||value>SELLER_MEASUREMENT_MAX_CM)){setError(`${row.label.trim()} 사이즈의 ${field.label} 값은 0보다 크고 ${SELLER_MEASUREMENT_MAX_CM}cm 이하로 입력해 주세요.`);return;}size[field.key]=value;}
   sizes.push(size);
  }
  if(new Set(sizes.map(size=>size.label)).size!==sizes.length){setError('같은 사이즈 이름을 두 번 사용할 수 없어요.');return;}
  const existing=products.find(product=>product.id===editingId),now=new Date().toISOString();
  // 새 사진에서 잰 실루엣이 있으면 그것을, 없으면 이미 저장된 실루엣(유지를 선택한 경우)을 쓴다. 상의 몸판은 상의에만, 바지 다리는 하의에만 저장한다.
  const photoShape=form.category!=='top'?null:shapeCandidate?(useShape?shapeCandidate:null):keepSavedShape?savedShape:null;
  const legShape=form.category!=='bottom'?null:legCandidate?(useShape?legCandidate:null):keepSavedShape?savedLegShape:null;
  // 상품 사진: 새 앞 사진이 3D에 맞으면 새 버전으로 저장하고, 새 사진이 없으면 저장된 사진을 유지(선택)하거나 지운다.
  const newFront=usePhotos&&frontPhoto?.photo&&!photoProblem(frontPhoto)?frontPhoto.photo:null,newBack=newFront&&backPhoto?.photo&&!photoProblem(backPhoto)?backPhoto.photo:null;
  const photo=!photoCategory?null:newFront?{version:newPhotoVersion(),back:Boolean(newBack)}:frontPhoto&&!usePhotos?null:keepSavedPhoto?savedPhoto??null:null;
  const candidate={version:1 as const,id:existing?.id??crypto.randomUUID(),storeName:form.storeName.trim(),name:form.name.trim(),category:form.category,color:form.color.trim(),colorHex:form.colorHex||null,photoShape,legShape,photo,features,material:form.material.trim()||null,priceKrw:price,stock,purchaseUrl:purchaseUrl||null,sizes,createdAt:existing?.createdAt??now,updatedAt:now,status:existing?.status??'draft' as const,publishedAt:existing?.publishedAt??null};
  const parsed=sellerProductSchema.safeParse(candidate);if(!parsed.success){setError(`${describeSellerProductIssue(parsed.error.issues[0]?.path??[],sizes)} 값을 다시 확인해 주세요.`);return;}
  const normalized=normalizeSellerProductPublication(parsed.data),wasUnpublished=existing?.status==='published'&&normalized.status==='draft';
  const next=upsertSellerProduct(products,normalized),saved=persist(next);
  if(saved&&newFront&&normalized.photo)saveStoredPhotos(normalized.id,normalized.photo.version,{front:newFront,...(newBack?{back:newBack}:{})}).catch(()=>{persist(upsertSellerProduct(next,{...normalized,photo:null}));setNotice('상품 사진을 이 브라우저에 저장하지 못했어요. 사진 없이 저장했어요.');});
  else if(saved&&!normalized.photo&&existing?.photo)void deleteStoredPhotos(normalized.id);
  setNotice(saved?(wasUnpublished?'필수 정보가 빠져 게시를 내리고 수정 내용을 저장했어요.':existing?'상품 정보를 수정했어요.':'상품 초안을 저장했어요.'):'브라우저에 저장하지 못했어요.');resetForm();
 }
 function editProduct(product:SellerProduct){clearImageState();setSavedPhoto(product.photo??null);setKeepSavedPhoto(true);setSavedShape(product.photoShape??null);setSavedLegShape(product.legShape??null);setKeepSavedShape(true);setForm({storeName:product.storeName,name:product.name,category:product.category,color:product.color,colorHex:product.colorHex??'',features:product.features.join(', '),material:product.material??'',price:product.priceKrw===null?'':String(product.priceKrw),stock:product.stock===null?'':String(product.stock),purchaseUrl:product.purchaseUrl??'',sizes:product.sizes.length?product.sizes.map(toSizeForm):[emptySizeForm()]});setEditingId(product.id);setError('');window.scrollTo({top:0,behavior:'smooth'});}
 function deleteProduct(product:SellerProduct){if(!window.confirm(`‘${product.name}’ 상품을 삭제할까요?`))return;persist(products.filter(item=>item.id!==product.id));void deleteStoredPhotos(product.id);if(editingId===product.id)resetForm();setNotice('상품을 삭제했어요.');}
 function togglePublication(product:SellerProduct){
  if(product.status==='published'){
   const next=unpublishSellerProduct(product);const saved=persist(upsertSellerProduct(products,next));setNotice(saved?'이용자 옷장에서 상품을 내렸어요.':'게시 상태를 저장하지 못했어요.');return;
  }
  const next=publishSellerProduct(product);if(!next){setNotice(`게시하려면 ${productReadiness(product).missing.join(', ')} 정보를 채워 주세요.`);return;}
  const saved=persist(upsertSellerProduct(products,next));setNotice(saved?'상품을 게시했어요. 이용자 옷장에서 바로 입어볼 수 있어요.':'게시 상태를 저장하지 못했어요.');
 }
 return <main className="seller-app"><SellerHeader active="products"/><section className="seller-page-heading"><div><span className="eyebrow">PRODUCT MANAGEMENT</span><h1>상품 등록과 관리</h1><p>광고 제작과 이용자 옷장에 사용할 상품 정보를 정리합니다.</p></div><span className="seller-local-badge">브라우저 저장 · 계정 동기화</span></section>
  <section className="seller-products-layout"><article className="seller-panel seller-registration"><div className="seller-panel-heading"><div><span className="eyebrow">{editingId?'EDIT PRODUCT':'NEW PRODUCT'}</span><h2>{editingId?'상품 정보 수정':'새 상품 등록'}</h2></div>{editingId&&<button type="button" onClick={resetForm}><X/>수정 취소</button>}</div>
   <div className="seller-product-form"><section><h3>상품 이미지</h3><div className="seller-image-field">{imageUrl?<img src={imageUrl} alt="등록 상품 미리보기"/>:<div><ImagePlus/><span>상품 이미지 미리보기</span></div>}<label><Upload/>이미지 선택<input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>chooseImage(event.target.files?.[0])}/></label></div><p>흰 배경에 옷을 평면으로 펼쳐 위에서 찍은 앞면 사진을 권해요. 대표색과 실루엣을 찾고, 원하면 옷 부분만 잘라 3D 옷에 입혀요(원본 사진은 저장하지 않아요).</p></section>
    <section><h3>기본 정보</h3><div className="seller-form-grid"><label><span>상점명 *</span><input value={form.storeName} maxLength={40} placeholder="예: 우리동네옷가게" onChange={event=>setField('storeName',event.target.value)}/></label><label><span>상품명 *</span><input value={form.name} maxLength={80} placeholder="예: 스트라이프 반팔 티셔츠" onChange={event=>setField('name',event.target.value)}/></label><label><span>카테고리 *</span><select value={form.category} onChange={event=>setField('category',event.target.value as SellerCategory)}>{SELLER_CATEGORIES.map(category=><option value={category} key={category}>{SELLER_CATEGORY_LABELS[category]}</option>)}</select></label><label><span>색상 *</span><input value={form.color} maxLength={40} placeholder="예: 네이비" onChange={event=>setField('color',event.target.value)}/></label><div className="seller-wide-field seller-color-field"><span>3D 표시 색상 <small>사진을 고르면 대표색을 찾아 줘요</small></span><div>{photoColors.map(color=><button type="button" key={color} className={form.colorHex.toLowerCase()===color?'active':''} style={{background:color}} aria-label={`사진에서 찾은 색 ${color}`} onClick={()=>setField('colorHex',color)}/>)}<input type="color" aria-label="3D 표시 색상 직접 고르기" value={form.colorHex||'#888888'} onChange={event=>setField('colorHex',event.target.value)}/>{form.colorHex?<><code>{form.colorHex}</code><button type="button" className="seller-color-clear" onClick={()=>setField('colorHex','')}>지우기</button></>:<small>비워 두면 색상 이름으로 정해요</small>}</div></div>{photoCategory&&(imageUrl||savedPhoto)&&<div className="seller-wide-field seller-photo-field" data-preparing={preparing||undefined}>{imageUrl?<>
     {(ai==='cached'||ai==='download')&&<div className="seller-ai-cutout">{autoAi?cutoutMethod==='ai'&&<small><Sparkles/>AI 배경 제거로 옷만 잘라냈어요. 사진은 이 기기 안에서만 처리해요.</small>:<><button type="button" onClick={enableAi} disabled={preparing}><Sparkles/>AI로 배경 지우기</button><small>바닥·옷걸이·발이 함께 찍힌 사진도 옷만 잘라내요. 처음 한 번 AI 모델(약 {Math.round(MATTING_MODEL.bytes/1e6)}MB)을 받아 이 브라우저에 저장하고, 사진은 이 기기 안에서만 처리해요.</small></>}{aiNote&&<small className="seller-ai-note">{aiNote}</small>}</div>}
     <label className="seller-texture-field"><input type="checkbox" checked={usePhotos&&Boolean(frontPhoto?.photo)&&!photoProblem(frontPhoto)} disabled={!frontPhoto?.photo||Boolean(photoProblem(frontPhoto))} onChange={event=>setUsePhotos(event.target.checked)}/>{frontPhoto?.photo&&<img src={frontPhoto.photo.image} alt="3D에 입힐 앞면 사진(옷 부분만 자름)"/>}<span><strong>상품 사진을 3D {photoCategory==='top'?'상의':'바지'}에 입히기</strong><small>{preparing?aiProgress||'사진에서 옷을 잘라 3D에 맞춰 보고 있어요…':photoProblem(frontPhoto)?`이 사진은 3D에 입힐 수 없어요: ${photoProblem(frontPhoto)}. 흰 배경에 옷을 평면으로 펼쳐 찍은 사진이면 잘 돼요.`:'사진 속 무늬·로고·색을 3D 옷의 앞판·뒤판·소매(바지는 다리)에 입혀요. 옷 부분만 잘라 이 브라우저에 저장하고, 계정 동기화를 하면 서버에도 올려 다른 이용자에게 보여요.'}</small></span></label>
     {frontPhoto?.photo&&!photoProblem(frontPhoto)&&<div className="seller-back-photo">{backPhoto?.photo&&<img src={backPhoto.photo.image} alt="뒷면 사진(옷 부분만 자름)"/>}<label><Upload/>뒷면 사진 {backPhoto?'바꾸기':'추가'}<input ref={backInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>chooseBackImage(event.target.files?.[0])}/></label><small>{backPhoto?(photoProblem(backPhoto)?`뒷면 사진은 쓰지 않아요: ${photoProblem(backPhoto)}`:'뒷면 사진을 3D 뒤판에 입혀요.'):'선택 사항이에요. 없으면 앞 사진의 옆쪽 원단으로 뒤판을 만들어요(가슴 프린트·단추는 옮기지 않아요).'}</small></div>}
    </>:<label className="seller-texture-field"><input type="checkbox" checked={keepSavedPhoto} onChange={event=>setKeepSavedPhoto(event.target.checked)}/><span><strong>저장된 상품 사진 유지</strong><small>{savedPhoto?.back?'앞·뒤':'앞면'} 사진이 3D 옷에 입혀져 있어요. 체크를 풀고 저장하면 사진을 지워요. 새 사진을 고르면 바꿀 수 있어요.</small></span></label>}</div>}{form.category==='top'&&shapeCandidate&&<label className="seller-wide-field seller-texture-field seller-shape-field"><input type="checkbox" checked={useShape} onChange={event=>setUseShape(event.target.checked)}/><ShapePreview shape={shapeCandidate}/><span><strong>사진 실루엣을 3D 몸판 모양에 반영</strong><small>겨드랑이는 옷 길이의 {Math.round(shapeCandidate.armpit*100)}% 지점, 밑단 폭은 가슴의 {Math.round(shapeCandidate.bodyWidths[shapeCandidate.bodyWidths.length-1]*100)}%예요. 사진은 저장하지 않고 이 비율 숫자만 상품 정보에 저장해 다른 기기의 이용자에게도 같은 모양으로 보여요. 크기는 입력한 가슴단면 실측을 따라요.</small></span></label>}{form.category==='top'&&imageUrl&&!shapeCandidate&&shapeReason&&<p className="seller-wide-field seller-texture-note">사진에서 몸판 모양을 재지 못했어요: {shapeReason}. 흰 배경에 옷을 평면으로 펼쳐 찍은 사진이면 잘 돼요.</p>}{form.category==='bottom'&&legCandidate&&<label className="seller-wide-field seller-texture-field seller-shape-field"><input type="checkbox" checked={useShape} onChange={event=>setUseShape(event.target.checked)}/><LegShapePreview shape={legCandidate}/><span><strong>사진 실루엣을 3D 바지 다리 모양에 반영</strong><small>가랑이는 바지 길이의 {Math.round(legCandidate.rise*100)}% 지점, 밑단 폭은 허벅지의 {Math.round(legCandidate.legWidths[legCandidate.legWidths.length-1]*100)}%예요. 사진은 저장하지 않고 이 비율 숫자만 상품 정보에 저장해요. 크기는 입력한 허리·허벅지단면 실측을 따르고, 비어 있는 기장·밑위·엉덩이단면은 사진 비율로 채워요.</small></span></label>}{form.category==='bottom'&&imageUrl&&!legCandidate&&legReason&&<p className="seller-wide-field seller-texture-note">사진에서 바지 모양을 재지 못했어요: {legReason}. 흰 배경에 바지를 앞면이 보이게 펼치고 두 다리를 조금 벌려 찍은 사진이면 잘 돼요.</p>}{form.category==='bottom'&&!legCandidate&&savedLegShape&&<label className="seller-wide-field seller-texture-field seller-shape-field"><input type="checkbox" checked={keepSavedShape} onChange={event=>setKeepSavedShape(event.target.checked)}/><LegShapePreview shape={savedLegShape}/><span><strong>저장된 바지 사진 실루엣 유지</strong><small>이전에 사진에서 잰 다리 모양이에요. 체크를 풀고 저장하면 기본 모양으로 돌아가요.</small></span></label>}{form.category==='top'&&!shapeCandidate&&savedShape&&<label className="seller-wide-field seller-texture-field seller-shape-field"><input type="checkbox" checked={keepSavedShape} onChange={event=>setKeepSavedShape(event.target.checked)}/><ShapePreview shape={savedShape}/><span><strong>저장된 사진 실루엣 유지</strong><small>이전에 사진에서 잰 몸판 모양이에요. 체크를 풀고 저장하면 기본 모양으로 돌아가요.</small></span></label>}<label className="seller-wide-field"><span>핵심 특징 * <small>쉼표로 구분 · 최대 5개</small></span><textarea value={form.features} maxLength={504} placeholder="예: 가로 스트라이프, 라운드넥, 여유 있는 실루엣" onChange={event=>setField('features',event.target.value)}/></label><label className="seller-wide-field"><span>소재</span><input value={form.material} maxLength={100} placeholder="확인한 경우에만 입력" onChange={event=>setField('material',event.target.value)}/></label><label><span>판매가</span><input inputMode="numeric" value={form.price} placeholder="29000" onChange={event=>setField('price',event.target.value)}/><small>원 단위</small></label><label><span>재고</span><input inputMode="numeric" value={form.stock} placeholder="10" onChange={event=>setField('stock',event.target.value)}/><small>현재 판매 가능 수량</small></label><label className="seller-wide-field"><span>상점 구매 링크 <small>선택</small></span><input inputMode="url" value={form.purchaseUrl} maxLength={500} placeholder="예: https://smartstore.naver.com/myshop/products/123" onChange={event=>setField('purchaseUrl',event.target.value)}/><small>스마트스토어·자사몰 등 실제 상품 페이지를 연결할 수 있어요.</small></label></div></section>
    <section><div className="seller-size-heading"><div><h3>사이즈별 실측</h3><p>단위 cm · 상의/하의의 너비 항목은 단면 기준</p></div><button type="button" disabled={form.sizes.length>=6} onClick={()=>setForm(previous=>({...previous,sizes:[...previous.sizes,emptySizeForm()]}))}><Plus/>행 추가</button></div><div className="seller-size-scroll"><table><thead><tr><th>사이즈</th>{fields.map(field=><th key={field.key}>{field.label}</th>)}<th><span className="sr-only">행 삭제</span></th></tr></thead><tbody>{form.sizes.map((size,index)=><tr key={index}><td><input aria-label={`${index+1}번째 사이즈 이름`} value={size.label} placeholder="M" maxLength={20} onChange={event=>setSize(index,'label',event.target.value)}/></td>{fields.map(field=><td key={field.key}><input aria-label={`${size.label||index+1} ${field.label}`} inputMode="decimal" value={size[field.key]} placeholder="-" onChange={event=>setSize(index,field.key,event.target.value)}/></td>)}<td><button type="button" aria-label={`${size.label||index+1} 사이즈 행 삭제`} disabled={form.sizes.length===1} onClick={()=>setForm(previous=>({...previous,sizes:previous.sizes.filter((_,row)=>row!==index)}))}><Trash2/></button></td></tr>)}</tbody></table></div><p className="seller-size-note">게시 준비 판정에는 {form.category==='hat'?'머리둘레':form.category==='top'?'총장과 가슴단면':'총장과 허리단면'}이 필요합니다. 초안은 실측 없이도 저장할 수 있어요.</p></section>
   </div>{error&&<div className="seller-form-error" role="alert">{error}</div>}<div className="seller-form-actions"><button type="button" className="seller-save-button" onClick={saveProduct}><PackagePlus/>{editingId?'수정 내용 저장':'상품 초안 저장'}</button><span>저장 후 오른쪽 상품 목록에서 게시할 수 있습니다.</span></div>
  </article>
  <aside className="seller-panel seller-catalog"><div className="seller-panel-heading"><div><span className="eyebrow">MY PRODUCTS</span><h2>등록 상품 <b>{products.length}</b></h2></div><a href="/wardrobe">이용자 옷장 보기 <ArrowRight/></a></div>{products.length===0?<div className="seller-empty compact"><PackagePlus/><h3>상품 목록이 비어 있어요</h3><p>왼쪽에서 첫 상품 초안을 저장해 보세요.</p></div>:<div className="seller-catalog-list">{products.map(product=>{const state=productReadiness(product),published=product.status==='published';return <article key={product.id}><div className="seller-catalog-title"><span>{SELLER_CATEGORY_LABELS[product.category].slice(0,1)}</span><div><small>{product.storeName}</small><strong>{product.name}</strong><p>{SELLER_CATEGORY_LABELS[product.category]} · {product.color}</p></div><em className={published?'published':state.ready?'ready':'draft'}>{published?'게시 중':state.ready?'게시 준비':'작성 중'}</em></div><div className="seller-progress"><span style={{width:`${state.percent}%`}}/></div><div className="seller-catalog-meta"><span>{product.priceKrw===null?'가격 미입력':`${product.priceKrw.toLocaleString('ko-KR')}원`}</span><span>{product.stock===null?'재고 미입력':product.stock===0?'품절':`재고 ${product.stock}`}</span><span>사이즈 {product.sizes.length}</span></div>{!state.ready&&<p className="seller-missing">남은 정보: {state.missing.join(', ')}</p>}<div className="seller-catalog-actions"><button type="button" className={published?'unpublish':'publish'} onClick={()=>togglePublication(product)}>{published?<><EyeOff/>게시 내리기</>:<><Eye/>옷장에 게시</>}</button><button type="button" onClick={()=>editProduct(product)}><Pencil/>수정</button><button type="button" onClick={()=>deleteProduct(product)}><Trash2/>삭제</button><a href={`/seller/ads?product=${encodeURIComponent(product.id)}`}>광고 만들기 <ArrowRight/></a></div></article>;})}</div>}</aside>
  </section><footer className="seller-footer"><span>FITROOM SELLER · 상품 등록 프로토타입</span><span>계정 동기화로 상품 정보를 다른 기기에서 이어서 관리할 수 있습니다.</span></footer>{notice&&<div className="toast" role="status">{notice}</div>}
 </main>;
}
