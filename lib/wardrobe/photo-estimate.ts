import type {BodyKey,BodyProfile} from './types';
import {BODY_FIELDS,cloneBody,setMeasurement} from './body';
export type Point={x:number;y:number;z?:number;visibility?:number};
export type PhotoEvidence={width:number;height:number;mask:Float32Array;points:Point[];people:number};
export function ellipseCircumference(width:number,depth:number){const a=width/2,b=depth/2;return Math.PI*(3*(a+b)-Math.sqrt((3*a+b)*(a+3*b)));}
function bounds(e:PhotoEvidence){let top=e.height,bottom=-1,left=e.width,right=-1;
 for(let y=0;y<e.height;y++)for(let x=0;x<e.width;x++)if(e.mask[y*e.width+x]>.65){top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);}
 if(bottom<top)throw new Error('몸의 윤곽을 찾지 못했어요. 배경과 구분되는 전신사진을 사용해 주세요.');
 if(top<e.height*.012||bottom>e.height*.988||left<e.width*.01||right>e.width*.99)throw new Error('전신이 잘렸거나 화면 가장자리에 너무 가까워요. 머리와 발 주위에 여백을 남겨 주세요.');
 return {top,bottom,left,right,pixelHeight:bottom-top};
}
function validateEvidence(e:PhotoEvidence,side:boolean){
 if(e.people!==1||e.points.length!==33)throw new Error('사진마다 한 사람의 전신이 보여야 해요.');
 if(e.mask.length!==e.width*e.height)throw new Error('사진 분석 결과가 올바르지 않아요. 다시 시도해 주세요.');
 for(const i of [0,11,12,23,24,27,28]){const p=e.points[i];if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<=0||p.x>=1||p.y<=0||p.y>=1||(!side&&(p.visibility??0)<.65))throw new Error('주요 신체 지점이 가려져 있어요. 팔을 몸에서 조금 떼고 머리부터 발까지 보이게 촬영해 주세요.');}
 const b=bounds(e),span=Math.abs(e.points[11].x-e.points[12].x)*e.width/b.pixelHeight;
 if(!side&&span<.12)throw new Error('정면사진에서 양쪽 어깨가 충분히 보이지 않아요. 카메라를 똑바로 바라봐 주세요.');
 if(side&&span>.13)throw new Error('측면사진이 정면에 가까워요. 몸을 옆으로 90도 돌려 촬영해 주세요.');
 return b;
}
function rowWidth(e:PhotoEvidence,yNorm:number,center:number){
 const y=Math.round(yNorm*(e.height-1)),x=Math.round(center*(e.width-1));const widths:number[]=[];
 for(let dy=-2;dy<=2;dy++){const yy=y+dy;if(yy<0||yy>=e.height)continue;let xx=x;if(e.mask[yy*e.width+xx]<.6){let found=false;for(let d=1;d<e.width*.06;d++){for(const s of [-1,1]){const test=x+s*d;if(test>=0&&test<e.width&&e.mask[yy*e.width+test]>.6){xx=test;found=true;break;}}if(found)break;}if(!found)continue;}
 let l=xx,r=xx;while(l>0&&e.mask[yy*e.width+l-1]>.6)l--;while(r<e.width-1&&e.mask[yy*e.width+r+1]>.6)r++;widths.push(r-l+1);}
 if(!widths.length)throw new Error('몸통 윤곽이 선명하지 않아요. 몸의 윤곽이 드러나는 옷으로 다시 촬영해 주세요.');widths.sort((a,b)=>a-b);return widths[Math.floor(widths.length/2)];
}
export function estimatePhotoBody(front:PhotoEvidence,side:PhotoEvidence,height:number,previous:BodyProfile):{body:BodyProfile;estimated:BodyKey[];preserved:BodyKey[]}{
 if(!Number.isFinite(height)||height<140||height>210)throw new Error('키를 140–210cm 범위로 입력해 주세요.');
 const f=validateEvidence(front,false),s=validateEvidence(side,true),sf=height/f.pixelHeight,ss=height/s.pixelHeight;
 const section=(e:PhotoEvidence,t:number)=>{const sh=(e.points[11].y+e.points[12].y)/2,hip=(e.points[23].y+e.points[24].y)/2;return {y:sh+(hip-sh)*t,x:(e.points[11].x+e.points[12].x+e.points[23].x+e.points[24].x)/4};};
 const guess:Partial<Record<BodyKey,number>>={height};
 for(const [key,t] of [['chest',.25],['waist',.69],['hips',1]] as const){const a=section(front,t),b=section(side,t);guess[key]=ellipseCircumference(rowWidth(front,a.y,a.x)*sf,rowWidth(side,b.y,b.x)*ss);}
 const shoulderSpan=Math.hypot((front.points[11].x-front.points[12].x)*front.width,(front.points[11].y-front.points[12].y)*front.height)*sf;
 // Landmark joint spacing is only an initialization estimate, not a tailoring measurement.
 guess.shoulders=shoulderSpan;
 const length=(a:Point,b:Point)=>Math.hypot((a.x-b.x)*front.width,(a.y-b.y)*front.height)*sf;
 guess.armLength=(length(front.points[11],front.points[13])+length(front.points[13],front.points[15])+length(front.points[12],front.points[14])+length(front.points[14],front.points[16]))/2;
 guess.legLength=(f.bottom-section(front,.69).y*front.height)*sf;
 let body=cloneBody(previous);const estimated:BodyKey[]=[],preserved:BodyKey[]=[];
 for(const field of BODY_FIELDS){const v=guess[field.key];if(v===undefined)continue;if(previous.sources[field.key]==='manual'&&field.key!=='height'){preserved.push(field.key);continue;}
 if(!Number.isFinite(v)||v<field.min||v>field.max){if(['chest','waist','hips'].includes(field.key))throw new Error('체형을 안정적으로 추정하지 못했어요. 사진 자세를 확인하거나 상세 치수를 직접 입력해 주세요.');continue;}
 body=setMeasurement(body,field.key,Math.round(v*10)/10,field.key==='height'?'manual':'photo');estimated.push(field.key);}
 return {body,estimated,preserved};
}
