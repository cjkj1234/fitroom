// 3D 피팅룸 카메라를 아바타 키와 화면 비율에 맞춘다. 키 175cm·데스크톱 화면에서는 예전 고정 카메라(높이 1.05m, 거리 3.8m)와 같다.
// - 세로: 바닥부터 정수리까지에 위아래 여유(키의 20%)를 더한 높이가 세로 시야에 들어오게 한다.
// - 가로: A 포즈로 벌린 손끝(키의 약 93%)이 가로 시야에 들어오게 한다. 다만 휴대폰처럼 아주 좁은 화면에서
//   손끝까지 맞추면 아바타가 너무 작아지므로, 세로로 맞춘 거리의 1.35배까지만 물러난다(그 이상이면 손끝은 잘린다).
// - insets: 화면 위·아래에서 글자·버튼이 아바타 가운데를 가리는 비율(0~0.3). 있으면 그 사이 영역에 아바타를 맞추고
//   여유는 키의 6%로 줄인다(휴대폰에서 제목에 머리가, 시점 버튼에 발이 가리지 않게).
// - 카메라는 바라보는 점보다 키에 비례해 조금 위에서 내려다본다.
export const STAGE_FOV=31;
const VERTICAL_SPAN=1.2,TIGHT_SPAN=1.06,ARM_SPAN=.93,MAX_WIDEN=1.35,LIFT_RATIO=.18/1.75;

export type StageInsets={top:number;bottom:number};
export type StageFraming={targetY:number;cameraY:number;distance:number;minDistance:number;maxDistance:number};
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,Number.isFinite(v)?v:0));

export function frameAvatar(heightM:number,aspect:number,fov=STAGE_FOV,insets:StageInsets={top:0,bottom:0}):StageFraming{
 const half=Math.tan(fov*Math.PI/360),height=clamp(heightM,1,2.3),wide=Math.max(.3,aspect);
 const top=clamp(insets.top,0,.3),bottom=clamp(insets.bottom,0,.3),covered=top>0||bottom>0,safe=1-top-bottom;
 const vertical=height*(covered?TIGHT_SPAN:VERTICAL_SPAN)/2/(half*safe),horizontal=height*ARM_SPAN/2/(half*wide);
 const distance=Math.max(vertical,Math.min(horizontal,vertical*MAX_WIDEN));
 // 가리지 않는 영역의 가운데는 화면 가운데보다 (위 비율 − 아래 비율)만큼 아래에 있으므로, 그만큼 위를 바라봐 아바타를 내린다.
 const targetY=height/2+(top-bottom)*distance*half;
 return {targetY,cameraY:targetY+height*LIFT_RATIO,distance,minDistance:distance*.55,maxDistance:distance*1.6};
}
