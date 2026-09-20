'use client';

import {useEffect,useRef,useState} from 'react';
import {AlertCircle,ArrowRight,Check,Copy,Download,FileImage,ImagePlus,Loader2,RefreshCw,ScanLine,Shirt,Sparkles,Upload} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Empty,EmptyDescription,EmptyHeader,EmptyMedia,EmptyTitle} from '@/components/ui/empty';
import {Input} from '@/components/ui/input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Textarea} from '@/components/ui/textarea';
import {adRequestSchema,adResponseSchema,firstValidationMessage,type AdDraft,type AdRequest} from '@/lib/ads/contracts';
import {formatDraftText,parseOptionalNumberInput,safeDownloadBaseName} from '@/lib/ads/client-utils';

type FormState={
 storeName:string;productName:string;category:AdRequest['product']['category'];color:string;features:string;material:string;price:string;discount:string;
 audience:string;tone:AdRequest['campaign']['tone'];purpose:AdRequest['campaign']['purpose'];cta:AdRequest['campaign']['cta'];additionalRequest:string;
};
type EditableDraft=Omit<AdDraft,'hashtags'>&{hashtags:string};

const INITIAL_FORM:FormState={
 storeName:'오후옷장',productName:'스트라이프 반팔 티셔츠',category:'top',color:'화이트·네이비',
 features:'가로 스트라이프, 라운드넥, 여유 있는 반팔 실루엣',material:'',price:'29000',discount:'',
 audience:'일상 캐주얼 코디를 찾는 20~30대',tone:'friendly',purpose:'product_intro',cta:'view_product',additionalRequest:'과장 없이 짧고 친근하게 써 주세요.',
};
const ANGLE_LABELS:Record<AdDraft['angle'],{number:string;title:string;description:string}>={
 product_facts:{number:'01',title:'상품 특징',description:'입력한 특징을 중심으로 소개'},
 styling:{number:'02',title:'스타일링',description:'다른 옷과의 코디 아이디어'},
 daily_scene:{number:'03',title:'일상 장면',description:'입기 좋은 상황을 제안'},
};

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
 const [imageUrl,setImageUrl]=useState('/catalog/6170660.png');
 const [form,setForm]=useState<FormState>(INITIAL_FORM);
 const [drafts,setDrafts]=useState<EditableDraft[]>([]);
 const [active,setActive]=useState(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [generatedFrom,setGeneratedFrom]=useState('');
 const [generationMeta,setGenerationMeta]=useState('');
 const objectUrl=useRef<string|null>(null);
 useEffect(()=>()=>{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),2600);return()=>clearTimeout(timer);},[notice]);
 const stale=Boolean(drafts.length&&generatedFrom&&generatedFrom!==JSON.stringify(form));
 const activeDraft=drafts[active];
 function setField<K extends keyof FormState>(key:K,value:FormState[K]){setForm(previous=>({...previous,[key]:value}));}
 function chooseImage(file?:File){
  if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('PNG, JPG, WEBP 이미지만 선택할 수 있어요.');return;}
  if(file.size>8*1024*1024){setError('이미지는 8MB 이하로 선택해 주세요.');return;}
  if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
  objectUrl.current=URL.createObjectURL(file);setImageUrl(objectUrl.current);setError('');
 }
 async function generate(){
  const candidate=toRequest(form);const validation=adRequestSchema.safeParse(candidate);
  if(!validation.success){setError(firstValidationMessage(validation.error));return;}
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/ads/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(validation.data)});
   const body:unknown=await response.json().catch(()=>null);
   if(!response.ok){const message=body&&typeof body==='object'&&'error' in body&&body.error&&typeof body.error==='object'&&'message' in body.error&&typeof body.error.message==='string'?body.error.message:'광고 문구를 만들지 못했어요. 다시 시도해 주세요.';throw new Error(message);}
   const checked=adResponseSchema.safeParse({drafts:body&&typeof body==='object'&&'drafts' in body?body.drafts:undefined});
   if(!checked.success)throw new Error('완성된 광고 문구 형식을 확인하지 못했어요. 다시 시도해 주세요.');
   setDrafts(checked.data.drafts.map(asEditable));setActive(0);setGeneratedFrom(JSON.stringify(form));
   setGenerationMeta(body&&typeof body==='object'&&'meta' in body&&body.meta&&typeof body.meta==='object'&&'model' in body.meta&&typeof body.meta.model==='string'?body.meta.model:'AI 생성');
   setNotice('광고 문구 초안 3개를 만들었어요.');
  }catch(reason){setError(reason instanceof Error?reason.message:'광고 문구를 만들지 못했어요. 다시 시도해 주세요.');}
  finally{setBusy(false);}
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
   context.fillStyle='#2557d6';context.font='700 24px Arial';context.fillText(form.storeName.toUpperCase(),120,760);
   context.fillStyle='#202227';context.font='700 48px Arial';let y=wrapText(context,activeDraft.headline,120,830,840,62);
   context.fillStyle='#555961';context.font='28px Arial';y=wrapText(context,activeDraft.body,120,y+22,840,43);
   context.fillStyle='#202227';context.font='700 27px Arial';y=wrapText(context,activeDraft.cta,120,y+22,840,42);
   context.fillStyle='#2557d6';context.font='24px Arial';wrapText(context,activeDraft.hashtags,120,y+18,840,36);
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('blob');const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`${safeDownloadBaseName(form.productName)}-광고카드.png`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('PNG 광고 카드를 저장했어요.');
  }catch{setNotice('PNG를 만들지 못했어요. 다른 이미지를 선택해 다시 시도해 주세요.');}
 }
 return <main className="ad-app">
  <header className="ad-header"><a className="brand" href="/" aria-label="FITROOM 역할 선택으로 이동"><span className="brand-mark"><ScanLine size={23}/></span>fitroom<span className="brand-period">.</span></a><div className="ad-nav"><span className="ad-nav-active">판매자 광고 스튜디오</span><span>상품 정보로 3가지 문구 만들기</span></div><Button asChild variant="outline" className="wardrobe-link"><a href="/wardrobe"><Shirt/>이용자 3D 옷장</a></Button></header>
  <section className="ad-hero"><div><span className="eyebrow">AI COPY WORKBENCH</span><h1>상품의 매력을 광고 문구로 바꿔보세요.</h1><p>확인된 상품 정보만 사용해 서로 다른 관점의 초안 3개를 만듭니다.</p></div><div className="ad-step"><b>01</b><span>정보 입력</span><i/><b>02</b><span>AI 생성</span><i/><b>03</b><span>편집·저장</span></div></section>
  <form className="ad-workspace" onSubmit={event=>{event.preventDefault();void generate();}}>
   <section className="ad-card product-visual-card" aria-labelledby="visual-title"><div className="ad-card-heading"><span>01</span><div><h2 id="visual-title">상품 이미지</h2><p>이미지는 브라우저 미리보기에만 사용돼요.</p></div></div><div className="product-visual"><img src={imageUrl} alt="광고 문구를 만들 상품 미리보기"/><span>미리보기</span></div><label className="image-upload"><Upload size={16}/><span>내 상품 이미지 선택</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>chooseImage(event.target.files?.[0])}/></label><p className="privacy-copy">사진은 AI에 전송하거나 저장하지 않습니다.</p></section>
   <section className="ad-card product-form-card" aria-labelledby="product-title"><div className="ad-card-heading"><span>02</span><div><h2 id="product-title">상품과 광고 정보</h2><p><em>*</em> 표시는 필수 입력입니다.</p></div></div><div className="ad-fields"><label><span>상점명 <em>*</em></span><Input value={form.storeName} onChange={event=>setField('storeName',event.target.value)} maxLength={40}/></label><label><span>상품명 <em>*</em></span><Input value={form.productName} onChange={event=>setField('productName',event.target.value)} maxLength={80}/></label><div className="field-pair"><label><span>카테고리 <em>*</em></span><Select value={form.category} onValueChange={value=>setField('category',value as FormState['category'])}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="top">상의</SelectItem><SelectItem value="bottom">하의</SelectItem><SelectItem value="hat">모자</SelectItem></SelectContent></Select></label><label><span>색상 <em>*</em></span><Input value={form.color} onChange={event=>setField('color',event.target.value)} maxLength={40}/></label></div><label><span>핵심 특징 <em>*</em></span><Textarea value={form.features} onChange={event=>setField('features',event.target.value)} maxLength={504}/><small>쉼표로 구분해 최대 5가지를 적어주세요. 확인한 사실만 사용합니다.</small></label><label><span>소재</span><Input value={form.material} onChange={event=>setField('material',event.target.value)} placeholder="예: 면 100% · 확인한 경우에만 입력" maxLength={100}/></label><div className="field-pair"><label><span>판매가</span><Input inputMode="numeric" value={form.price} onChange={event=>setField('price',event.target.value)} placeholder="예: 29000"/><small>원 단위 숫자</small></label><label><span>할인율</span><Input inputMode="numeric" value={form.discount} onChange={event=>setField('discount',event.target.value)} placeholder="예: 10"/><small>할인 홍보 선택 시 필수</small></label></div><div className="ad-rule"/><label><span>주요 고객 <em>*</em></span><Input value={form.audience} onChange={event=>setField('audience',event.target.value)} maxLength={80}/></label><div className="field-pair"><label><span>말투 <em>*</em></span><Select value={form.tone} onValueChange={value=>setField('tone',value as FormState['tone'])}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="friendly">친근하고 자연스럽게</SelectItem><SelectItem value="minimal">간결하고 담백하게</SelectItem><SelectItem value="energetic">밝고 활기차게</SelectItem></SelectContent></Select></label><label><span>광고 목적 <em>*</em></span><Select value={form.purpose} onValueChange={value=>setField('purpose',value as FormState['purpose'])}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="product_intro">상품 소개</SelectItem><SelectItem value="new_arrival">신상품 소개</SelectItem><SelectItem value="promotion">할인 홍보</SelectItem></SelectContent></Select></label></div><label><span>마지막 안내 <em>*</em></span><Select value={form.cta} onValueChange={value=>setField('cta',value as FormState['cta'])}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="view_product">상품 보기</SelectItem><SelectItem value="visit_store">매장 방문</SelectItem><SelectItem value="inquire">문의하기</SelectItem></SelectContent></Select></label><label><span>추가 요청</span><Textarea value={form.additionalRequest} onChange={event=>setField('additionalRequest',event.target.value)} placeholder="예: 출근룩과 주말 코디를 함께 제안해 주세요." maxLength={300}/></label></div>{error&&<div className="ad-error" role="alert"><AlertCircle/>{error}</div>}<Button type="submit" className="generate-button" disabled={busy}>{busy?<><Loader2 className="spin"/>문구를 만들고 있어요</>:<><Sparkles/>AI 광고 문구 3개 만들기<ArrowRight/></>}</Button><p className="generate-note">입력한 사실을 넘어서는 효능이나 소재 정보는 만들지 않습니다.</p></section>
   <section className="ad-card results-card" aria-labelledby="result-title"><div className="ad-card-heading result-heading"><span>03</span><div><h2 id="result-title">광고 문구 초안</h2><p>생성 후 바로 고쳐 쓰고 저장할 수 있어요.</p></div>{drafts.length>0&&<span className="generated-badge"><Check/>초안 3개</span>}</div>{busy&&drafts.length===0?<div className="generation-state" role="status"><Loader2 className="spin"/><h3>상품 정보를 읽고 있어요</h3><p>세 가지 관점의 문구를 만드는 중입니다.</p></div>:drafts.length===0?<Empty className="result-empty"><EmptyHeader><EmptyMedia variant="icon"><ImagePlus/></EmptyMedia><EmptyTitle>아직 만든 문구가 없어요</EmptyTitle><EmptyDescription>상품 정보를 확인한 뒤 생성 버튼을 누르면<br/>서로 다른 관점의 초안 3개가 여기에 표시됩니다.</EmptyDescription></EmptyHeader><div className="empty-angles"><span>상품 특징</span><span>스타일링</span><span>일상 장면</span></div></Empty>:<><div className="draft-tabs" role="tablist" aria-label="광고 초안">{drafts.map((draft,index)=>{const label=ANGLE_LABELS[draft.angle];return <button type="button" role="tab" aria-selected={active===index} className={active===index?'active':''} key={draft.angle} onClick={()=>setActive(index)}><b>{label.number}</b><span>{label.title}<small>{label.description}</small></span></button>;})}</div>{stale&&<div className="stale-note"><RefreshCw/>상품 정보가 바뀌었어요. 현재 편집 내용은 유지되며, 재생성하면 새 정보가 반영됩니다.</div>}<div className="draft-editor"><div className="draft-label-row"><span>{ANGLE_LABELS[activeDraft.angle].title} 초안</span><small>{generationMeta} · 게시 전 확인 필요</small></div><label><span>제목 <small>{[...activeDraft.headline].length}/40</small></span><Input value={activeDraft.headline} onChange={event=>updateDraft('headline',event.target.value)} maxLength={40}/></label><label><span>본문 <small>{[...activeDraft.body].length}/220</small></span><Textarea value={activeDraft.body} onChange={event=>updateDraft('body',event.target.value)} maxLength={220}/></label><label><span>마지막 안내 <small>{[...activeDraft.cta].length}/40</small></span><Input value={activeDraft.cta} onChange={event=>updateDraft('cta',event.target.value)} maxLength={40}/></label><label><span>해시태그</span><Textarea className="hashtag-editor" value={activeDraft.hashtags} onChange={event=>updateDraft('hashtags',event.target.value)} maxLength={150}/></label></div><div className="result-actions"><Button type="button" variant="outline" onClick={()=>void copyDraft()}><Copy/>복사</Button><Button type="button" variant="outline" onClick={downloadText}><Download/>TXT</Button><Button type="button" onClick={()=>void downloadPng()}><FileImage/>PNG 카드</Button></div></>}</section>
  </form>
  <footer className="ad-footer"><span>FITROOM · 작은 의류 상점을 위한 AI 광고 스튜디오</span><span>생성 결과는 게시 전 판매자가 직접 확인해 주세요.</span></footer>{notice&&<div className="toast" role="status"><Check size={16}/>{notice}</div>}
 </main>;
}
