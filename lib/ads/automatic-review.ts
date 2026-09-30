import type {AdDraft,AdRequest} from './contracts';

const RISKY_CLAIMS=['방수','발수','보온','신축성','자외선 차단','체형 보정','다리가 길어','슬림해 보','구김 방지','항균','친환경','한정 수량','무료 배송','정가','원래 가격','할인 전','하루 종일','편하게 입','편하게 쓸','편하게 착용','부담 없이','부담을 주지'];
const DISCLOSURE_PHRASES=['제공되지 않','입력되지 않','정보가 없'];
const PURPOSE_SIGNALS:Partial<Record<AdRequest['campaign']['purpose'],RegExp>>={new_arrival:/신상|새로|입고|신규|새 상품/,promotion:/할인|세일|%|퍼센트/};
// 사람이 쓴 글처럼 읽히지 않게 하는 AI 문투 후보(blader/humanizer의 패턴을 한국어 광고 문구에 맞게 옮김). 입력에 있던 표현은 제외한다.
const AI_PATTERNS=[
 '뿐만 아니라','뿐 아니라','가 아니라','이 아니라','단순한','단순히',
 '의 정석','일상의 완성','스타일의 완성','감성을 입','필수템','인생템','놓치지 마',
 '완벽','최고','세련','스타일리시','트렌디','감각적','깔끔','기본 아이템','핵심 아이템','고급스러','무난',
 '궁금한 점','궁금하시면','언제든','문의 환영','제안합니다','추천드립니다','추천합니다',
];
const ECHO_WINDOW=4;

const compact=(value:string)=>value.replace(/[\s.,!?·~]/g,'');
const sentencesOf=(draft:AdDraft)=>draft.body.split(/[.!?\n]+/).map(part=>part.trim().replace(/\s+/g,' ')).filter(part=>[...part].length>=8);
const duplicates=(groups:string[][])=>{
 const seen=new Map<string,number>();
 groups.forEach(group=>new Set(group).forEach(item=>seen.set(item,(seen.get(item)??0)+1)));
 return [...seen].filter(([,count])=>count>1).map(([item])=>item);
};

// 판매자의 문체 요청을 그대로 옮겨 쓴 흔적을 찾는다(상품 정보에 원래 있던 표현은 제외).
function requestEchoCandidates(request:AdRequest,outputText:string){
 const asked=request.campaign.additionalRequest;
 if(!asked)return [];
 const requested=compact(asked),output=compact(outputText),product=compact(JSON.stringify({storeName:request.storeName,product:request.product,audience:request.campaign.audience}));
 const marked=new Array<boolean>(requested.length).fill(false);
 for(let start=0;start+ECHO_WINDOW<=requested.length;start++){
  const window=requested.slice(start,start+ECHO_WINDOW);
  if(output.includes(window)&&!product.includes(window))for(let index=start;index<start+ECHO_WINDOW;index++)marked[index]=true;
 }
 const runs:string[]=[];
 let current='';
 marked.forEach((flag,index)=>{if(flag)current+=requested[index];else if(current){runs.push(current);current='';}});
 if(current)runs.push(current);
 return runs;
}

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
 // 문체·구성 검사: 요청 문장 인용, 광고 목적 누락, 초안 사이의 반복. 사실 검사와 별도의 사람 검토 후보다.
 const disclosureCandidates=DISCLOSURE_PHRASES.filter(phrase=>drafts.some(draft=>`${draft.headline} ${draft.body} ${draft.cta}`.includes(phrase)));
 const copyText=drafts.map(draft=>`${draft.headline} ${draft.body} ${draft.cta}`).join(' ');
 const aiPatternCandidates=AI_PATTERNS.filter(pattern=>copyText.includes(pattern)&&!sourceText.includes(pattern));
 const openingOf=(draft:AdDraft)=>draft.body.trim().split(/\s+/).slice(0,2).join(' ');
 const purposeSignal=PURPOSE_SIGNALS[request.campaign.purpose];
 const styleReview={
  requestEchoCandidates:requestEchoCandidates(request,drafts.map(draft=>`${draft.headline} ${draft.body} ${draft.cta}`).join(' ')),
  purposeMissingDrafts:purposeSignal?drafts.flatMap((draft,index)=>purposeSignal.test(`${draft.headline} ${draft.body}`)?[]:[index+1]):[],
  repeatedSentences:duplicates(drafts.map(sentencesOf)),
  repeatedCtas:duplicates(drafts.map(draft=>[draft.cta.trim()])),
  disclosureCandidates,
  aiPatternCandidates,
  repeatedOpenings:duplicates(drafts.map(draft=>[openingOf(draft)])),
 };
 const needsStyleReview=styleReview.requestEchoCandidates.length>0||styleReview.purposeMissingDrafts.length>0||styleReview.repeatedSentences.length>0||styleReview.repeatedCtas.length>0||styleReview.disclosureCandidates.length>0||styleReview.aiPatternCandidates.length>0||styleReview.repeatedOpenings.length>0;
 return {schemaValid:true,productSignalCount:productSignals.length,unsupportedClaimCandidates,unsupportedNumberCandidates,needsManualReview:unsupportedClaimCandidates.length>0||unsupportedNumberCandidates.length>0,styleReview,needsStyleReview};
}
