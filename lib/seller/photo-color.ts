// 상품 사진에서 3D 표시용 대표색 후보를 찾는다. 사진은 브라우저 안에서만 읽고 저장하지 않는다.
type Rgb=[number,number,number];

const toHex=(color:Rgb)=>`#${color.map(value=>Math.round(Math.max(0,Math.min(255,value))).toString(16).padStart(2,'0')).join('')}`;
const distance=(a:Rgb,b:Rgb)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]??0;};

// 배경은 사진 가장자리 색의 중앙값으로 잡는다(흰색·회색 배경 모두 처리).
export function estimateBackground(pixels:ArrayLike<number>,width:number,height:number):Rgb{
 const at=(x:number,y:number):Rgb=>{const i=(y*width+x)*4;return [pixels[i],pixels[i+1],pixels[i+2]];};
 const border:Rgb[]=[];const edge=Math.max(1,Math.floor(Math.min(width,height)*.04));
 for(let x=0;x<width;x+=Math.max(1,Math.floor(width/40)))for(let e=0;e<edge;e++){border.push(at(x,e));border.push(at(x,height-1-e));}
 for(let y=0;y<height;y+=Math.max(1,Math.floor(height/40)))for(let e=0;e<edge;e++){border.push(at(e,y));border.push(at(width-1-e,y));}
 return [median(border.map(c=>c[0])),median(border.map(c=>c[1])),median(border.map(c=>c[2]))];
}

// pixels는 RGBA 순서(ImageData.data와 같은 형식)이다. 반환값은 큰 덩어리부터 최대 count개의 #rrggbb.
export function dominantColors(pixels:ArrayLike<number>,width:number,height:number,count=3):string[]{
 if(width<2||height<2||pixels.length<width*height*4)return [];
 const at=(x:number,y:number):Rgb=>{const i=(y*width+x)*4;return [pixels[i],pixels[i+1],pixels[i+2]];};
 const background=estimateBackground(pixels,width,height);
 // 가운데 영역만 표본으로 삼고, 배경과 비슷하거나 투명한 픽셀은 뺀다.
 const samples:Rgb[]=[];const step=Math.max(1,Math.floor(Math.sqrt((width*height)/30000)));
 for(let y=Math.floor(height*.12);y<Math.floor(height*.9);y+=step)for(let x=Math.floor(width*.15);x<Math.floor(width*.85);x+=step){
  const i=(y*width+x)*4;if(pixels.length>i+3&&pixels[i+3]<200)continue;
  const color=at(x,y);if(distance(color,background)>=30)samples.push(color);
 }
 if(samples.length<20)return [];
 // 밝기 순으로 고르게 뽑은 점에서 시작하는 k-means(항상 같은 결과).
 const k=Math.min(4,Math.max(count,2));const byLuma=[...samples].sort((a,b)=>a[0]+a[1]+a[2]-(b[0]+b[1]+b[2]));
 let centers:Rgb[]=Array.from({length:k},(_,n)=>byLuma[Math.floor(byLuma.length*(n+.5)/k)]);
 let sizes:number[]=new Array(k).fill(0);
 for(let round=0;round<14;round++){
  const sums=Array.from({length:k},()=>[0,0,0,0]);
  for(const color of samples){let best=0,bestDistance=Infinity;for(let n=0;n<k;n++){const d=distance(color,centers[n]);if(d<bestDistance){bestDistance=d;best=n;}}sums[best][0]+=color[0];sums[best][1]+=color[1];sums[best][2]+=color[2];sums[best][3]++;}
  centers=centers.map((center,n)=>sums[n][3]?[sums[n][0]/sums[n][3],sums[n][1]/sums[n][3],sums[n][2]/sums[n][3]] as Rgb:center);sizes=sums.map(sum=>sum[3]);
 }
 return centers.map((center,n)=>({center,share:sizes[n]/samples.length})).filter(item=>item.share>=.06).sort((a,b)=>b.share-a.share).slice(0,count).map(item=>toHex(item.center));
}
