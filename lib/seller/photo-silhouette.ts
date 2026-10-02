// 평면 촬영한 상의 사진의 윤곽에서 3D 모양에 쓸 실루엣 비율을 잰다. 사진은 브라우저 안에서만 읽고, 결과는 숫자 몇 개뿐이라
// 색상값(colorHex)처럼 상품 정보에 저장해 다른 기기의 이용자에게도 같은 모양을 보여 줄 수 있다.
// 모든 값은 가슴 평면 폭(겨드랑이 바로 아래 몸판 폭)에 대한 비율이라 판매자가 입력한 가슴단면 실측(cm)으로 크기를 정한다.
import type {GarmentCutout} from './photo-texture';

export const SILHOUETTE_SAMPLES=11;
export type TopSilhouette={
 version:1;
 // 겨드랑이(0)부터 밑단(1)까지 같은 간격 11곳의 몸판 평면 폭 ÷ 가슴 평면 폭
 bodyWidths:number[];
 // 옷 위끝부터 겨드랑이까지의 길이 ÷ 옷 전체 길이
 armpit:number;
 // 옷 전체 길이 ÷ 가슴 평면 폭
 lengthToChest:number;
};
// 소매는 사진마다 접힌 각도와 모양이 크게 달라 재지 않는다(소매 길이는 판매자 실측을 쓴다).
export const SILHOUETTE_LIMITS={bodyWidth:[.5,1.6],armpit:[.08,.55],lengthToChest:[.6,2.2]} as const;

const median=(values:number[])=>{if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];};
const within=(value:number,[min,max]:readonly [number,number])=>value>=min&&value<=max;

export function measureTopSilhouette(cutout:GarmentCutout):TopSilhouette|null{return analyzeTopSilhouette(cutout).silhouette;}
// 실패하면 이유(reason)를 함께 돌려줘 판매자 화면과 테스트에서 왜 못 쟀는지 알 수 있게 한다.
export function analyzeTopSilhouette(cutout:GarmentCutout):{silhouette:TopSilhouette|null;reason:string}{
 const {mask,width,box}=cutout,height=box.y1-box.y0+1,fail=(reason:string)=>({silhouette:null,reason});
 if(height<40||box.x1-box.x0<30)return fail('윤곽이 너무 작아요');
 const runsAt=(y:number)=>{const runs:Array<[number,number]>=[];let start=-1;for(let x=box.x0;x<=box.x1+1;x++){const on=x<=box.x1&&mask[y*width+x]===1;if(on&&start<0)start=x;if(!on&&start>=0){runs.push([start,x-1]);start=-1;}}return runs;};
 // 아래쪽 몸판(소매가 없는 높이)의 가운데를 옷 중심으로 잡는다.
 const lowRows:number[]=[];for(let y=Math.floor(box.y0+height*.66);y<=Math.floor(box.y0+height*.92);y++)lowRows.push(y);
 const cx=median(lowRows.flatMap(y=>{const runs=runsAt(y);if(!runs.length)return [];const widest=runs.reduce((a,b)=>b[1]-b[0]>a[1]-a[0]?b:a);return [(widest[0]+widest[1])/2];}));
 // 중심을 지나는(없으면 가장 가까운) 덩어리가 그 높이의 몸판이다. 소매가 붙은 높이에서는 소매까지 포함된다.
 const central=(y:number)=>{const runs=runsAt(y);let best:[number,number]|null=null,gap=Infinity;for(const run of runs){const d=cx<run[0]?run[0]-cx:cx>run[1]?cx-run[1]:0;if(d<gap){gap=d;best=run;}}return gap<width*.05?best:null;};
 const rowWidth=(y:number)=>{const run=central(y);return run?run[1]-run[0]+1:0;};
 const smooth=(y:number)=>median([-2,-1,0,1,2].map(d=>rowWidth(Math.max(box.y0,Math.min(box.y1,y+d)))));
 // 겨드랑이: 밑단 쪽에서 위로 올라가며, 그 아래 몸판 폭의 추세(직선)보다 가슴 폭의 5% 넘게 넓은 줄이 3줄 이어지는 곳을 찾는다.
 // 소매 아랫선이 몸판에 비스듬히 이어져 폭이 한 줄씩 서서히 넓어지는 사진도 있으므로, 추세는 최근 9줄을 뺀 그 아래 15줄로만 맞춘다
 // (그래야 넓어지기 시작한 줄이 추세에 섞이지 않는다). 찾은 뒤에는 폭이 넓어지기 시작한 줄까지 내려가 그곳을 겨드랑이로 삼는다.
 // 밑단이 좁아지는 옷처럼 폭이 천천히 변하는 곳은 추세가 따라가므로 겨드랑이로 오인하지 않는다.
 let armpit=-1,baseWidth=0;const rows:Array<[number,number]>=[];let streak=0;
 for(let y=Math.floor(box.y0+height*.88);y>=Math.floor(box.y0+height*.1);y--){
  const w=smooth(y);
  if(rows.length>=24){
   const reference=rows.slice(-24,-9),n=reference.length,my=reference.reduce((a,r)=>a+r[0],0)/n,mw=reference.reduce((a,r)=>a+r[1],0)/n;
   let num=0,den=0;for(const [ry,rw] of reference){num+=(ry-my)*(rw-mw);den+=(ry-my)**2;}
   const slope=den?num/den:0,predicted=mw+slope*(y-my);
   if(w-predicted>Math.max(4,mw*.05)){streak++;if(streak===3){armpit=y;baseWidth=mw;break;}}else streak=0;
  }
  rows.push([y,w]);
 }
 if(armpit>=0)while(armpit<box.y1&&smooth(armpit+1)>baseWidth+3)armpit++;
 if(armpit<0)return fail('소매가 붙는 겨드랑이 높이를 찾지 못했어요');
 const chest=median([2,3,4,5,6].map(d=>rowWidth(Math.min(box.y1,armpit+d))));
 if(chest<10)return fail('가슴 폭을 재지 못했어요');
 const hem=box.y1-height*.01;
 // 첫 측정점은 겨드랑이 줄에 남은 소매 끝을 피해 조금 아래(옷 높이의 1.5%, 최소 3줄)에서 잰다.
 const first=armpit+Math.max(3,height*.015);
 const bodyWidths=Array.from({length:SILHOUETTE_SAMPLES},(_,i)=>Math.round(smooth(Math.round(first+(hem-first)*i/(SILHOUETTE_SAMPLES-1)))/chest*1000)/1000);
 const armpitRatio=Math.round((armpit-box.y0)/height*1000)/1000,lengthToChest=Math.round(height/chest*1000)/1000;
 if(!bodyWidths.every(value=>within(value,SILHOUETTE_LIMITS.bodyWidth)))return fail(`몸판 폭 비율이 범위를 벗어났어요(${bodyWidths.join(', ')})`);
 if(!within(armpitRatio,SILHOUETTE_LIMITS.armpit))return fail(`겨드랑이 위치(${armpitRatio})가 범위를 벗어났어요`);
 if(!within(lengthToChest,SILHOUETTE_LIMITS.lengthToChest))return fail(`기장 비율(${lengthToChest})이 범위를 벗어났어요`);
 return {silhouette:{version:1,bodyWidths,armpit:armpitRatio,lengthToChest},reason:''};
}
