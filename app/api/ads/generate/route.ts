import {adRequestSchema,firstValidationMessage} from '@/lib/ads/contracts';
import {AdGenerationError,generateAdDrafts} from '@/lib/ads/openai';

const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(request:Request){
 let raw:unknown;
 try{raw=await request.json();}catch{return json({error:{code:'invalid_json',message:'요청 내용을 읽지 못했어요.'}},400);}
 const parsed=adRequestSchema.safeParse(raw);
 if(!parsed.success)return json({error:{code:'invalid_input',message:firstValidationMessage(parsed.error)}},400);

 const apiKey=process.env.OPENAI_API_KEY;
 if(!apiKey)return json({error:{code:'configuration_missing',message:'교육용 OpenAI API 연결 설정이 필요해요. 관리자에게 환경변수 설정을 요청해 주세요.'}},503);

 try{
  return json(await generateAdDrafts(parsed.data,apiKey));
 }catch(error){
  if(error instanceof AdGenerationError)return json({error:{code:error.code,message:error.message}},error.status);
  return json({error:{code:'connection_failed',message:'AI 서비스에 연결하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.'}},502);
 }
}
