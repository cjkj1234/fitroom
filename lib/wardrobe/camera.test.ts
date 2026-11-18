import test from 'node:test';
import assert from 'node:assert/strict';
import {frameAvatar,STAGE_FOV} from './camera';

const half=STAGE_FOV*Math.PI/360;
// 카메라(0, cameraY, 수평거리)에서 (0, targetY, 0)을 볼 때, 아바타 평면(z=0) 위 점이 시야 가장자리에서 얼마나 안쪽인지(1=가운데, 0=가장자리).
function margins(heightM:number,aspect:number){
 const f=frameAvatar(heightM,aspect),lift=f.cameraY-f.targetY,flat=Math.sqrt(f.distance**2-lift**2);
 const down=Math.atan2(lift,flat),vertical=(y:number)=>1-Math.abs(Math.atan2(f.cameraY-y,flat)-down)/half;
 const horizontal=(x:number)=>1-Math.atan2(Math.abs(x),flat)/Math.atan(Math.tan(half)*aspect);
 return {f,feet:vertical(-.02),head:vertical(heightM+.03),hands:horizontal(heightM*.46)};
}

test('키 175cm·데스크톱 화면에서는 예전 고정 카메라(높이 1.05m, 거리 3.8m, 바라보는 높이 0.87m)와 같다',()=>{
 const {f}=margins(1.75,662/839);
 assert.ok(Math.abs(f.distance-3.8)<.05,`거리 ${f.distance}`);
 assert.ok(Math.abs(f.cameraY-1.05)<.01&&Math.abs(f.targetY-.875)<.01,`${f.cameraY} ${f.targetY}`);
 assert.ok(f.minDistance<f.distance&&f.maxDistance>f.distance);
});

test('키 140~210cm, 화면 비율 0.5~1.8에서 발끝과 머리끝(머리카락 포함)이 세로 시야 안에 들어온다',()=>{
 for(let height=1.4;height<=2.101;height+=.05)for(const aspect of [.5,.79,1.13,1.8]){
  const {feet,head}=margins(height,aspect);
  assert.ok(feet>.02&&head>.02,`키 ${(height*100).toFixed(0)}cm 비율 ${aspect}: 발 ${feet.toFixed(3)} 머리 ${head.toFixed(3)}`);
 }
});

test('보통 화면에서는 A 포즈 손끝까지 가로 시야에 들어오고, 아주 좁은 화면에서는 아바타가 너무 작아지지 않게 물러나는 거리를 제한한다',()=>{
 for(let height=1.4;height<=2.101;height+=.05)for(const aspect of [.79,1.13,1.8]){
  const {hands}=margins(height,aspect);assert.ok(hands>0,`키 ${(height*100).toFixed(0)}cm 비율 ${aspect}: 손끝 ${hands.toFixed(3)}`);
 }
 const narrow=frameAvatar(1.75,.5),tall=frameAvatar(1.75,1.13);
 assert.ok(narrow.distance>tall.distance,'좁은 화면은 손끝을 위해 조금 물러난다');
 assert.ok(narrow.distance<=tall.distance*1.35+1e-9,'좁은 화면 거리 제한');
 // 키가 클수록 멀리서 보고, 바라보는 높이도 올라간다.
 assert.ok(frameAvatar(1.97,.79).distance>frameAvatar(1.75,.79).distance&&frameAvatar(1.97,.79).targetY>frameAvatar(1.75,.79).targetY);
});

test('휴대폰처럼 위 제목·아래 시점 버튼이 가운데를 가리면, 머리끝과 발끝이 그 사이(가리지 않는 영역)에 들어온다',()=>{
 for(let height=1.4;height<=2.101;height+=.05)for(const insets of [{top:.22,bottom:.17},{top:.3,bottom:0},{top:0,bottom:.25}]){
  const f=frameAvatar(height,.69,STAGE_FOV,insets),lift=f.cameraY-f.targetY,flat=Math.sqrt(f.distance**2-lift**2),down=Math.atan2(lift,flat);
  // 화면 세로 위치: −1(아래 끝) ~ 1(위 끝).
  const screen=(y:number)=>Math.tan(Math.atan2(y-f.cameraY,flat)+down)/Math.tan(half);
  const head=screen(height+.03),feet=screen(-.02),label=`키 ${(height*100).toFixed(0)}cm ${JSON.stringify(insets)}`;
  assert.ok(head<1-2*insets.top,`${label}: 머리 ${head.toFixed(3)} > ${1-2*insets.top}`);
  assert.ok(feet>-1+2*insets.bottom,`${label}: 발 ${feet.toFixed(3)} < ${-1+2*insets.bottom}`);
 }
 // 가리는 것이 없으면 예전과 같은 결과다.
 assert.deepEqual(frameAvatar(1.75,.79,STAGE_FOV,{top:0,bottom:0}),frameAvatar(1.75,.79));
});
