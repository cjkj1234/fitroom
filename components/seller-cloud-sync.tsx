'use client';

import {useEffect,useState} from 'react';
import {CheckCircle2,Cloud,CloudDownload,CloudUpload,LoaderCircle,LogIn,RefreshCw,TriangleAlert} from 'lucide-react';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle,AlertDialogTrigger} from '@/components/ui/alert-dialog';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle,DialogTrigger} from '@/components/ui/dialog';
import {parseStoredSellerProducts,SELLER_PRODUCTS_STORAGE_KEY} from '@/lib/seller/products';
import {parseStoredSellerStore,SELLER_STORE_STORAGE_KEY} from '@/lib/seller/store';
import {createSellerWorkspacePayload,type SellerWorkspaceSnapshot} from '@/lib/seller/workspace';

type SyncResponse={workspace:SellerWorkspaceSnapshot|null;summary:{productCount:number;publishedCount:number;hasStore:boolean;updatedAt:string|null}};
type SyncError={error?:{code?:string;message?:string}};

function formatDate(value:string|null){return value?new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'아직 저장하지 않음';}
function signInPath(){const returnTo=`${window.location.pathname}${window.location.search}`;return `/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`;}

export default function SellerCloudSync(){
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[remote,setRemote]=useState<SyncResponse|null>(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[needsSignIn,setNeedsSignIn]=useState(false);

 async function readResponse(response:Response){const data=await response.json() as SyncResponse&SyncError;if(!response.ok)throw Object.assign(new Error(data.error?.message||'서버 동기화에 실패했어요.'),{status:response.status});return data;}
 async function refresh(){setLoading(true);setError('');setNeedsSignIn(false);try{const response=await fetch('/api/seller/workspace',{cache:'no-store'});const data=await readResponse(response);setRemote(data);setMessage('');}catch(cause){const issue=cause as Error&{status?:number};setNeedsSignIn(issue.status===401);setError(issue.message);}finally{setLoading(false);}}
 useEffect(()=>{if(open)void refresh();},[open]);

 function localPayload(){
  const products=parseStoredSellerProducts(localStorage.getItem(SELLER_PRODUCTS_STORAGE_KEY));
  const store=parseStoredSellerStore(localStorage.getItem(SELLER_STORE_STORAGE_KEY));
  return createSellerWorkspacePayload(products,store);
 }

 async function upload(){
  const payload=localPayload();if(!payload){setError('이 기기의 상품 또는 매장 정보를 확인해 주세요.');return;}
  setSaving(true);setError('');setMessage('');
  try{const response=await fetch('/api/seller/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await readResponse(response);setRemote(data);setMessage(`상품 ${data.summary.productCount}개와 매장 설정을 서버에 저장했어요.`);}catch(cause){const issue=cause as Error&{status?:number};setNeedsSignIn(issue.status===401);setError(issue.message);}finally{setSaving(false);}
 }

 function download(){
  if(!remote?.workspace)return;
  try{
   localStorage.setItem(SELLER_PRODUCTS_STORAGE_KEY,JSON.stringify(remote.workspace.products));
   if(remote.workspace.store)localStorage.setItem(SELLER_STORE_STORAGE_KEY,JSON.stringify(remote.workspace.store));else localStorage.removeItem(SELLER_STORE_STORAGE_KEY);
   setMessage('서버 데이터를 이 기기에 불러왔어요. 화면을 새로고침합니다.');setTimeout(()=>window.location.reload(),650);
  }catch{setError('이 기기의 브라우저 저장소에 데이터를 쓰지 못했어요.');}
 }

 return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><button type="button" className="seller-sync-trigger" aria-label="판매자 계정 동기화" title="계정 동기화"><Cloud/><span>계정 동기화</span></button></DialogTrigger><DialogContent className="seller-sync-dialog"><DialogHeader><span className="eyebrow">ACCOUNT SYNC</span><DialogTitle>판매자 데이터 동기화</DialogTitle><DialogDescription>상품과 가상 매장 설정을 로그인한 계정에 저장하고 다른 기기에서 불러옵니다.</DialogDescription></DialogHeader>
  <section className="sync-summary" aria-live="polite">{loading?<div className="sync-loading"><LoaderCircle/>서버 저장 상태를 확인하고 있어요.</div>:error?<div className="sync-error"><TriangleAlert/><span><strong>동기화 상태를 확인하지 못했어요</strong><small>{error}</small>{needsSignIn&&<a href={signInPath()}><LogIn/>로그인하기</a>}</span></div>:<><div className="sync-cloud-icon"><Cloud/></div><div><small>서버에 저장된 작업</small><strong>{remote?.workspace?`${remote.summary.productCount}개 상품 · 매장 ${remote.summary.hasStore?'1개':'없음'}`:'저장된 작업이 없어요'}</strong><span>{formatDate(remote?.summary.updatedAt??null)}</span></div><button type="button" onClick={()=>void refresh()} aria-label="서버 저장 상태 새로고침"><RefreshCw/></button></>}</section>
  <div className="sync-actions"><AlertDialog><AlertDialogTrigger asChild><button type="button" disabled={loading||saving}><CloudUpload/><span><strong>{saving?'저장 중…':'이 기기 데이터를 서버에 저장'}</strong><small>현재 상품과 매장 설정으로 서버 데이터를 갱신합니다.</small></span></button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>서버 데이터를 갱신할까요?</AlertDialogTitle><AlertDialogDescription>서버에 저장된 이전 상품과 매장 설정이 이 기기의 현재 데이터로 바뀝니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={()=>void upload()}>서버에 저장</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
   <AlertDialog><AlertDialogTrigger asChild><button type="button" disabled={loading||saving||!remote?.workspace}><CloudDownload/><span><strong>서버 데이터를 이 기기로 불러오기</strong><small>{remote?.workspace?'현재 브라우저 데이터를 서버 내용으로 바꿉니다.':'먼저 다른 기기에서 서버에 저장해 주세요.'}</small></span></button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 기기의 데이터를 바꿀까요?</AlertDialogTitle><AlertDialogDescription>현재 브라우저의 상품과 매장 설정이 서버에 저장된 내용으로 교체됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={download}>불러오기</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
  {message&&<p className="sync-success"><CheckCircle2/>{message}</p>}<p className="sync-privacy">상품 텍스트와 매장 설정만 저장합니다. 상품 사진, 체형 사진, 이용자 보관함은 포함하지 않습니다.</p>
 </DialogContent></Dialog>;
}
