import {AD_MODEL,AD_PROMPT_VERSION,adRequestSchema,firstValidationMessage} from '@/lib/ads/contracts';
import {AdGenerationError,generateAdDrafts} from '@/lib/ads/openai';

const MAX_REQUEST_BYTES=32_768;
const json=(body:unknown,status=200,requestId?:string)=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...(requestId?{'X-Request-Id':requestId}:{})}});
const log=(requestId:string,outcome:string,startedAt:number,errorCode?:string)=>console.info(JSON.stringify({event:'ad_generation',requestId,outcome,errorCode,model:AD_MODEL,promptVersion:AD_PROMPT_VERSION,durationMs:Date.now()-startedAt}));

export async function POST(request:Request){
 const requestId=crypto.randomUUID();const startedAt=Date.now();
 let raw:unknown;
 let body:string;
 try{body=await request.text();}catch{log(requestId,'rejected',startedAt,'invalid_body');return json({error:{code:'invalid_json',message:'요청 내용을 읽지 못했어요.'}},400,requestId);}
 if(new TextEncoder().encode(body).byteLength>MAX_REQUEST_BYTES){log(requestId,'rejected',startedAt,'request_too_large');return json({error:{code:'request_too_large',message:'입력 내용이 너무 길어요. 상품 정보를 줄여 다시 시도해 주세요.'}},413,requestId);}
 try{raw=JSON.parse(body);}catch{log(requestId,'rejected',startedAt,'invalid_json');return json({error:{code:'invalid_json',message:'요청 내용을 읽지 못했어요.'}},400,requestId);}
 const parsed=adRequestSchema.safeParse(raw);
 if(!parsed.success){log(requestId,'rejected',startedAt,'invalid_input');return json({error:{code:'invalid_input',message:firstValidationMessage(parsed.error)}},400,requestId);}

 const apiKey=process.env.OPENAI_API_KEY;
 if(!apiKey){log(requestId,'failed',startedAt,'configuration_missing');return json({error:{code:'configuration_missing',message:'교육용 OpenAI API 연결 설정이 필요해요. 관리자에게 환경변수 설정을 요청해 주세요.'}},503,requestId);}

 try{
  const result=await generateAdDrafts(parsed.data,apiKey);log(requestId,'succeeded',startedAt);return json(result,200,requestId);
 }catch(error){
  if(error instanceof AdGenerationError){log(requestId,'failed',startedAt,error.code);return json({error:{code:error.code,message:error.message}},error.status,requestId);}
  log(requestId,'failed',startedAt,'connection_failed');return json({error:{code:'connection_failed',message:'AI 서비스에 연결하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.'}},502,requestId);
 }
}
