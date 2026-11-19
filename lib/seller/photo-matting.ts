// AI 배경 제거: 상품 사진에서 옷(전경)의 알파 마스크를 얻는다. ISNet general-use(DIS, Apache-2.0)의 ONNX fp16 변환본(img.ly, MIT)을
// onnxruntime-web의 WebGPU로 이 브라우저 안에서 돌리므로 사진은 기기 밖으로 나가지 않는다. 모델(약 88MB)은 Hugging Face의 고정된
// 커밋에서 처음 한 번 받아 크기와 SHA-256을 확인한 뒤 Cache Storage에 두고, 실행기(onnxruntime-web)는 jsDelivr에서 버전을 고정해 읽는다
// (둘 다 Cloudflare 정적 파일 한도 25MiB보다 커서 사이트에서 직접 내려주지 않는다).
// WebGPU가 없거나 fp16 셰이더를 못 쓰는 기기(소프트웨어 GPU 포함)에서는 쓰지 않고, 판매자 화면은 배경색 방식(photo-texture.ts)을 쓴다.
// BiRefNet_lite(MIT)도 시험했지만 디코더의 변형 합성곱이 1024px에서 수 GB의 색인 텐서를 만들어 브라우저 WASM 메모리(4GB)를 넘었다.

export const MATTING_MODEL={
 name:'ISNet general-use (fp16)',
 url:'https://huggingface.co/imgly/isnet-general-onnx/resolve/440dea96dd4a3b06bbbf5abec3e26569dd7ec49f/onnx/model_fp16.onnx',
 bytes:88_152_708,
 sha256:'2eb4b5dda7ec41c617e59706e5aafa1f978c9a5f983d2518d9f0ae4d6eb04f20',
 size:1024,
} as const;
export const ORT_VERSION='1.31.1';
const ORT_BASE=`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const CACHE_NAME='fitroom-models-v1';

// 모델 입력: size×size RGBA 픽셀 → [1,3,size,size] 채널 우선. ISNet은 (값 − 128) ÷ 256으로 정규화한다(img.ly 전처리 설정).
export function toModelInput(rgba:ArrayLike<number>,size:number):Float32Array{
 const plane=size*size,out=new Float32Array(plane*3);
 for(let i=0;i<plane;i++)for(let c=0;c<3;c++)out[c*plane+i]=(rgba[i*4+c]-128)/256;
 return out;
}
// 모델 출력(옷일 확률 0~1) → 0~255 알파.
export function probabilityToAlpha(probability:ArrayLike<number>):Uint8Array{
 const out=new Uint8Array(probability.length);
 for(let i=0;i<probability.length;i++)out[i]=Math.round(Math.min(1,Math.max(0,probability[i]))*255);
 return out;
}

// 사진 전체를 덮는 width×height 알파(0~255, 255=옷). 사진 비율과 상관없이 모델 크기(1024×1024)다.
export type Matte={width:number;height:number;alpha:Uint8Array};
// cached: 바로 쓸 수 있음. download: 쓸 수 있지만 모델을 처음 받아야 함. unsupported: 이 브라우저에서는 못 씀.
export type MattingSupport='cached'|'download'|'unsupported';
export type MattingProgress={phase:'download';loaded:number;total:number}|{phase:'prepare'}|{phase:'run'};

type GpuDevice={destroy():void};
type GpuAdapter={features:{has(name:string):boolean};limits:Record<string,number>;info?:{isFallbackAdapter?:boolean};isFallbackAdapter?:boolean;requestDevice(options?:{requiredFeatures?:string[];requiredLimits?:Record<string,number>}):Promise<GpuDevice>};
type GpuNavigator=Navigator&{gpu?:{requestAdapter(options?:{powerPreference?:string}):Promise<GpuAdapter|null>}};
type OrtTensor={data:ArrayLike<number>;dispose?:()=>void};
type OrtSession={inputNames:readonly string[];outputNames:readonly string[];run(feeds:Record<string,OrtTensor>):Promise<Record<string,OrtTensor>>};
type OrtModule={
 env:{wasm:{wasmPaths?:string;numThreads?:number};webgpu:{device:unknown}};
 Tensor:new(type:'float32',data:Float32Array,dims:number[])=>OrtTensor;
 InferenceSession:{create(model:Uint8Array,options:{executionProviders:string[];graphOptimizationLevel?:string}):Promise<OrtSession>};
};

// 장치는 어댑터가 허용하는 최대 한도로 직접 열어 실행기에 넘긴다(기본 한도로는 1024px 특징 맵 버퍼가 모자랄 수 있다).
const RAISED_LIMITS=['maxStorageBuffersPerShaderStage','maxStorageBufferBindingSize','maxBufferSize','maxComputeWorkgroupStorageSize','maxComputeInvocationsPerWorkgroup','maxComputeWorkgroupSizeX','maxComputeWorkgroupSizeY','maxComputeWorkgroupSizeZ','maxComputeWorkgroupsPerDimension'];
async function openDevice():Promise<GpuDevice|null>{
 const gpu=(navigator as GpuNavigator).gpu;if(!gpu)return null;
 const adapter=await gpu.requestAdapter({powerPreference:'high-performance'});
 if(!adapter||adapter.info?.isFallbackAdapter||adapter.isFallbackAdapter||!adapter.features.has('shader-f16'))return null;
 const requiredLimits=Object.fromEntries(RAISED_LIMITS.filter(name=>typeof adapter.limits[name]==='number').map(name=>[name,adapter.limits[name]]));
 return adapter.requestDevice({requiredFeatures:['shader-f16'],requiredLimits});
}

export async function mattingSupport():Promise<MattingSupport>{
 try{
  if(typeof caches==='undefined'||!crypto?.subtle)return 'unsupported';
  // 어댑터가 있어도 장치를 못 여는 브라우저가 있다(셰이더 컴파일러가 빠진 빌드 등). 모델을 받게 하기 전에 실제로 열어 본다.
  const device=await openDevice();if(!device)return 'unsupported';device.destroy();
  const cache=await caches.open(CACHE_NAME);return (await cache.match(MATTING_MODEL.url))?'cached':'download';
 }catch{return 'unsupported';}
}

const toHex=(buffer:ArrayBuffer)=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');
let progress:((value:MattingProgress)=>void)|undefined;

async function loadModel():Promise<Uint8Array>{
 const cache=await caches.open(CACHE_NAME),hit=await cache.match(MATTING_MODEL.url);
 if(hit){const bytes=new Uint8Array(await hit.arrayBuffer());if(bytes.length===MATTING_MODEL.bytes)return bytes;await cache.delete(MATTING_MODEL.url);}
 const response=await fetch(MATTING_MODEL.url);
 if(!response.ok||!response.body)throw new Error(`AI 모델을 받지 못했어요(${response.status})`);
 const reader=response.body.getReader(),bytes=new Uint8Array(MATTING_MODEL.bytes);let loaded=0;
 for(;;){
  const {done,value}=await reader.read();if(done)break;
  if(loaded+value.length>bytes.length){await reader.cancel();throw new Error('AI 모델 파일 크기가 예상과 달라요');}
  bytes.set(value,loaded);loaded+=value.length;progress?.({phase:'download',loaded,total:bytes.length});
 }
 if(loaded!==bytes.length)throw new Error('AI 모델을 끝까지 받지 못했어요');
 if(toHex(await crypto.subtle.digest('SHA-256',bytes))!==MATTING_MODEL.sha256)throw new Error('AI 모델 파일이 예상과 달라요');
 // 모델을 바꾸면 예전 모델 파일이 브라우저에 남지 않게 지운다.
 for(const request of await cache.keys())if(request.url!==MATTING_MODEL.url)await cache.delete(request).catch(()=>false);
 await cache.put(MATTING_MODEL.url,new Response(bytes,{headers:{'content-type':'application/octet-stream'}})).catch(()=>{});
 return bytes;
}
async function loadRuntime():Promise<OrtModule>{
 const url=`${ORT_BASE}ort.webgpu.min.mjs`,ort=await import(/* @vite-ignore */ url) as OrtModule;
 ort.env.wasm.wasmPaths=ORT_BASE;ort.env.wasm.numThreads=1;return ort;
}

// 모델은 한 번만 읽어 화면을 떠날 때까지 다시 쓴다. 실패하면 다음 요청에서 다시 시도한다.
let session:Promise<{ort:OrtModule;session:OrtSession}>|null=null;
function ready(){
 if(!session){
  session=(async()=>{
   const [ort,model,device]=await Promise.all([loadRuntime(),loadModel(),openDevice()]);
   if(!device)throw new Error('이 기기의 그래픽 장치로는 AI 모델을 돌릴 수 없어요');
   progress?.({phase:'prepare'});ort.env.webgpu.device=device;
   return {ort,session:await ort.InferenceSession.create(model,{executionProviders:['webgpu'],graphOptimizationLevel:'all'})};
  })();
  session.catch(()=>{session=null;});
 }
 return session;
}
// 한 세션에서 동시에 두 장(앞·뒤)을 돌리지 않도록 차례로 실행한다.
let queue:Promise<unknown>=Promise.resolve();

// 사진의 옷 알파를 구한다. 투명한 부분은 흰 배경으로 보고 모델 크기로 늘여 넣는다.
export function computeMatte(image:CanvasImageSource,onProgress?:(value:MattingProgress)=>void):Promise<Matte>{
 const task=queue.then(async()=>{
  progress=onProgress;
  try{
   const {ort,session:model}=await ready();onProgress?.({phase:'run'});
   const size=MATTING_MODEL.size,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
   const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('canvas');
   context.fillStyle='#fff';context.fillRect(0,0,size,size);context.imageSmoothingQuality='high';context.drawImage(image,0,0,size,size);
   const input=new ort.Tensor('float32',toModelInput(context.getImageData(0,0,size,size).data,size),[1,3,size,size]);
   const output=await model.run({[model.inputNames[0]]:input}),result=output[model.outputNames[0]];
   const alpha=probabilityToAlpha(result.data);input.dispose?.();result.dispose?.();
   return {width:size,height:size,alpha};
  }finally{progress=undefined;}
 });
 queue=task.catch(()=>{});
 return task;
}
