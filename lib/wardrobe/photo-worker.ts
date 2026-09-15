import {FilesetResolver,PoseLandmarker} from '@mediapipe/tasks-vision';
import {estimatePhotoBody,type PhotoEvidence} from './photo-estimate';
import type {BodyProfile} from './types';
let detector:PoseLandmarker|undefined;
async function detect(bitmap:ImageBitmap):Promise<PhotoEvidence>{
 const scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));const canvas=new OffscreenCanvas(Math.round(bitmap.width*scale),Math.round(bitmap.height*scale));
 canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 return new Promise((resolve,reject)=>{try{detector!.detect(canvas,result=>{const m=result.segmentationMasks?.[0];if(!m){reject(new Error('사진에서 사람의 윤곽을 찾지 못했어요.'));return;}
 resolve({width:m.width,height:m.height,mask:new Float32Array(m.getAsFloat32Array()),points:result.landmarks[0]??[],people:result.landmarks.length});});}catch(e){reject(e);}});
}
self.onmessage=async(event:MessageEvent<{front:ImageBitmap;side:ImageBitmap;height:number;body:BodyProfile;origin:string}>)=>{
 const {front,side,height,body,origin}=event.data;
 try{
   self.postMessage({type:'progress',message:'기기 안에서 분석 도구를 준비하고 있어요…'});
   if(!detector){const files=await FilesetResolver.forVisionTasks(`${origin}/vision`,true);detector=await PoseLandmarker.createFromOptions(files,{canvas:new OffscreenCanvas(1,1),baseOptions:{modelAssetPath:`${origin}/models/pose_landmarker_lite.task`,delegate:'CPU'},runningMode:'IMAGE',numPoses:2,outputSegmentationMasks:true,minPoseDetectionConfidence:.65,minPosePresenceConfidence:.65});}
   self.postMessage({type:'progress',message:'정면과 측면의 체형을 비교하고 있어요…'});
   const f=await detect(front),s=await detect(side);const result=estimatePhotoBody(f,s,height,body);self.postMessage({type:'result',...result});
 }catch(e){self.postMessage({type:'error',message:e instanceof Error?e.message:'사진 분석에 실패했어요. 다시 시도하거나 상세 치수를 입력해 주세요.'});}
 finally{front.close();side.close();detector?.close();detector=undefined;}
};
