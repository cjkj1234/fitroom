import {AD_INSTRUCTIONS,AD_MODEL,AD_PROMPT_VERSION,adRequestSchema,adResponseSchema,extractOpenAIText,firstValidationMessage,openAIAdResponseSchema} from '@/lib/ads/contracts';

const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(request:Request){
 let raw:unknown;
 try{raw=await request.json();}catch{return json({error:{code:'invalid_json',message:'요청 내용을 읽지 못했어요.'}},400);}
 const parsed=adRequestSchema.safeParse(raw);
 if(!parsed.success)return json({error:{code:'invalid_input',message:firstValidationMessage(parsed.error)}},400);

 const apiKey=process.env.OPENAI_API_KEY;
 if(!apiKey)return json({error:{code:'configuration_missing',message:'교육용 OpenAI API 연결 설정이 필요해요. 관리자에게 환경변수 설정을 요청해 주세요.'}},503);

 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),30_000);
 try{
  const response=await fetch('https://api.openai.com/v1/responses',{
   method:'POST',signal:controller.signal,
   headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},
   body:JSON.stringify({
    model:AD_MODEL,
    store:false,
    instructions:AD_INSTRUCTIONS,
    input:`아래 JSON 데이터로 인스타그램 게시물 광고 문구를 작성하세요.\n${JSON.stringify(parsed.data)}`,
    text:{format:{type:'json_schema',name:'fitroom_ad_drafts',strict:true,schema:openAIAdResponseSchema}},
   }),
  });
  if(!response.ok){
   const code=response.status===429?'rate_limited':response.status>=500?'provider_unavailable':'generation_failed';
   const message=response.status===429?'요청이 잠시 몰렸어요. 잠시 뒤 다시 시도해 주세요.':'광고 문구를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.';
   return json({error:{code,message}},response.status===429?429:502);
  }
  const responseBody:unknown=await response.json();
  const text=extractOpenAIText(responseBody);
  if(!text)return json({error:{code:'empty_response',message:'완성된 광고 문구를 받지 못했어요. 다시 시도해 주세요.'}},502);
  let candidate:unknown;
  try{candidate=JSON.parse(text);}catch{return json({error:{code:'invalid_response',message:'광고 문구 형식을 확인하지 못했어요. 다시 시도해 주세요.'}},502);}
  const result=adResponseSchema.safeParse(candidate);
  if(!result.success)return json({error:{code:'invalid_response',message:'광고 문구가 필요한 형식을 충족하지 못했어요. 다시 시도해 주세요.'}},502);
  return json({...result.data,meta:{model:AD_MODEL,promptVersion:AD_PROMPT_VERSION}});
 }catch(error){
  if(error instanceof Error&&error.name==='AbortError')return json({error:{code:'timeout',message:'생성 시간이 길어졌어요. 다시 시도해 주세요.'}},504);
  return json({error:{code:'connection_failed',message:'AI 서비스에 연결하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.'}},502);
 }finally{clearTimeout(timeout);}
}
