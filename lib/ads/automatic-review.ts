import type {AdDraft,AdRequest} from './contracts';

const RISKY_CLAIMS=['방수','발수','보온','신축성','자외선 차단','체형 보정','다리가 길어','슬림해 보','구김 방지','항균','친환경','한정 수량','무료 배송'];

export function automaticReview(request:AdRequest,drafts:AdDraft[]){
 const sourceText=JSON.stringify(request);
 const outputText=drafts.map(draft=>`${draft.headline} ${draft.body} ${draft.cta} ${draft.hashtags.join(' ')}`).join(' ');
 const unsupportedClaimCandidates=RISKY_CLAIMS.filter(claim=>outputText.includes(claim)&&!sourceText.includes(claim));
 const numberClaims=outputText.match(/\d[\d,]*(?:원|%|대)?/g)??[];
 const sourceNumbers=new Set((sourceText.match(/\d+/g)??[]).map(value=>String(Number(value))));
 const unsupportedNumberCandidates=[...new Set(numberClaims.filter(claim=>{
  const digits=claim.replace(/\D/g,'');
  return digits.length>0&&!sourceNumbers.has(String(Number(digits)));
 }))];
 const productSignals=[request.product.name,request.product.color,...request.product.features].filter(signal=>outputText.includes(signal));
 return {schemaValid:true,productSignalCount:productSignals.length,unsupportedClaimCandidates,unsupportedNumberCandidates,needsManualReview:unsupportedClaimCandidates.length>0||unsupportedNumberCandidates.length>0};
}
