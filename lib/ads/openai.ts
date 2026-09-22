import {AD_INSTRUCTIONS,AD_MODEL,AD_PROMPT_VERSION,adResponseSchema,extractOpenAIText,openAIAdResponseSchema,type AdRequest} from './contracts';

export type AdGenerationErrorCode='authentication_failed'|'rate_limited'|'provider_unavailable'|'generation_failed'|'empty_response'|'invalid_response'|'timeout'|'connection_failed';

export class AdGenerationError extends Error{
 constructor(public code:AdGenerationErrorCode,message:string,public status:number){super(message);this.name='AdGenerationError';}
}

type Fetcher=(input:string|URL|Request,init?:RequestInit)=>Promise<Response>;

export async function generateAdDrafts(request:AdRequest,apiKey:string,fetcher:Fetcher=fetch){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),30_000);
 const startedAt=Date.now();
 try{
  const response=await fetcher('https://api.openai.com/v1/responses',{
   method:'POST',signal:controller.signal,
   headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},
   body:JSON.stringify({
    model:AD_MODEL,
    store:false,
    instructions:AD_INSTRUCTIONS,
    input:`아래 JSON 데이터로 인스타그램 게시물 광고 문구를 작성하세요.\n${JSON.stringify(request)}`,
    text:{format:{type:'json_schema',name:'fitroom_ad_drafts',strict:true,schema:openAIAdResponseSchema}},
   }),
  });
  if(!response.ok){
   if(response.status===401||response.status===403)throw new AdGenerationError('authentication_failed','OpenAI API 프로젝트가 비활성화되었거나 키 권한이 없어요. 활성 프로젝트의 새 키를 연결해 주세요.',503);
   if(response.status===429)throw new AdGenerationError('rate_limited','요청이 잠시 몰렸어요. 잠시 뒤 다시 시도해 주세요.',429);
   if(response.status>=500)throw new AdGenerationError('provider_unavailable','AI 서비스가 잠시 응답하지 않아요. 다시 시도해 주세요.',502);
   throw new AdGenerationError('generation_failed','광고 문구를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.',502);
  }
  let responseBody:unknown;
  try{responseBody=await response.json();}catch{throw new AdGenerationError('invalid_response','광고 문구 응답을 읽지 못했어요. 다시 시도해 주세요.',502);}
  const text=extractOpenAIText(responseBody);
  if(!text)throw new AdGenerationError('empty_response','완성된 광고 문구를 받지 못했어요. 다시 시도해 주세요.',502);
  let candidate:unknown;
  try{candidate=JSON.parse(text);}catch{throw new AdGenerationError('invalid_response','광고 문구 형식을 확인하지 못했어요. 다시 시도해 주세요.',502);}
  const result=adResponseSchema.safeParse(candidate);
  if(!result.success)throw new AdGenerationError('invalid_response','광고 문구가 필요한 형식을 충족하지 못했어요. 다시 시도해 주세요.',502);
  return {...result.data,meta:{model:AD_MODEL,promptVersion:AD_PROMPT_VERSION,durationMs:Date.now()-startedAt}};
 }catch(error){
  if(error instanceof AdGenerationError)throw error;
  if(error instanceof Error&&error.name==='AbortError')throw new AdGenerationError('timeout','생성 시간이 길어졌어요. 다시 시도해 주세요.',504);
  throw new AdGenerationError('connection_failed','AI 서비스에 연결하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.',502);
 }finally{clearTimeout(timeout);}
}
