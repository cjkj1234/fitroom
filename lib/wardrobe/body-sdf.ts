// 몸(마네킹 메시)과 먼저 입은 옷의 부호 있는 거리장(SDF). 천 시뮬레이션에서 옷이 몸·아래 옷을 뚫지 않게 하는 충돌체다.
// 격자 꼭짓점마다 안이면 음수, 밖이면 양수인 거리(m)를 둔다. 표면 가까이(band 칸 안)는 삼각형까지의 정확한 거리,
// 그 바깥은 이웃 칸을 따라 퍼뜨린 근사 거리다. 안팎은 그 높이에서 메시를 수평으로 잘라 만든 단면 안에 있는지로 정한다.
// 메시마다 수평 단면이 닫힌 고리여야 한다(마네킹은 구멍 없이 닫혀 있고, 바지 엉덩이·다리는 위아래가 열린 관이라 그 높이 안에서는 닫힌다).
// 여러 메시는 메시마다 따로 거리장을 만든 뒤 칸마다 가장 작은 값을 남겨 합집합으로 합친다. 한 격자에서 모든 삼각형까지의 거리를
// 함께 재면, 바지 안쪽(몸과 바지 사이)처럼 다른 메시 안에 묻힌 몸 표면이 가장 가까운 표면으로 잡혀 천을 몸 쪽으로 미는 일이 생긴다.
export type BodySdf={origin:[number,number,number];cell:number;nx:number;ny:number;nz:number;data:Float32Array};
export type Bounds={min:[number,number,number];max:[number,number,number]};

export type SdfMesh={positions:Float32Array;indices:Uint32Array};
export function buildBodySdf(meshes:SdfMesh[],bounds:Bounds,cell=.008,band=2):BodySdf{
 const [ox,oy,oz]=bounds.min,nx=Math.ceil((bounds.max[0]-ox)/cell)+1,ny=Math.ceil((bounds.max[1]-oy)/cell)+1,nz=Math.ceil((bounds.max[2]-oz)/cell)+1;
 const data=new Float32Array(nx*ny*nz).fill(Infinity);
 for(const mesh of meshes)meshSdf(mesh,{origin:[ox,oy,oz],cell,nx,ny,nz},band,data);
 // 어느 메시의 영역에도 들지 않은 칸은 모든 표면에서 멀리 떨어진 바깥이다.
 for(let n=0;n<data.length;n++)if(data[n]===Infinity)data[n]=band*cell*4;
 return {origin:[ox,oy,oz],cell,nx,ny,nz,data};
}

// 메시 하나의 거리장을 그 메시를 둘러싼 작은 격자(메시 범위 + band+3칸)에서만 만들어 전체 격자(target)에 작은 값으로 합친다.
// 벨트 고리처럼 작은 메시가 전체 격자를 다 훑지 않게 하기 위해서다. 범위 밖 칸은 이 메시와 멀어 합집합에 영향이 없다.
function meshSdf({positions,indices}:SdfMesh,grid:Omit<BodySdf,'data'>,band:number,target:Float32Array){
 const cell=grid.cell,margin=band+3;
 let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
 for(let i=0;i<positions.length;i+=3){minX=Math.min(minX,positions[i]);maxX=Math.max(maxX,positions[i]);minY=Math.min(minY,positions[i+1]);maxY=Math.max(maxY,positions[i+1]);minZ=Math.min(minZ,positions[i+2]);maxZ=Math.max(maxZ,positions[i+2]);}
 const range=(low:number,high:number,origin:number,count:number)=>[Math.max(0,Math.floor((low-origin)/cell)-margin),Math.min(count-1,Math.ceil((high-origin)/cell)+margin)];
 const [I0,I1]=range(minX,maxX,grid.origin[0],grid.nx),[J0,J1]=range(minY,maxY,grid.origin[1],grid.ny),[K0,K1]=range(minZ,maxZ,grid.origin[2],grid.nz);
 if(I0>I1||J0>J1||K0>K1)return;
 const ox=grid.origin[0]+I0*cell,oy=grid.origin[1]+J0*cell,oz=grid.origin[2]+K0*cell,nx=I1-I0+1,ny=J1-J0+1,nz=K1-K0+1;
 const at=(i:number,j:number,k:number)=>(j*nz+k)*nx+i,count=nx*ny*nz;
 const inside=new Uint8Array(count),data=new Float32Array(count).fill(Infinity);
 const reach=band*cell,triangles=indices.length/3;
 // 1) 안팎: 높이 j마다 그 높이를 지나는 삼각형을 잘라 선분을 만들고, z 줄마다 선분과 만나는 x를 정렬해 홀짝 규칙으로 채운다.
 const layers:number[][]=Array.from({length:ny},()=>[]);
 for(let t=0;t<triangles;t++){
  const a=indices[t*3],b=indices[t*3+1],c=indices[t*3+2],ya=positions[a*3+1],yb=positions[b*3+1],yc=positions[c*3+1];
  const j0=Math.max(0,Math.ceil((Math.min(ya,yb,yc)-oy)/cell)),j1=Math.min(ny-1,Math.floor((Math.max(ya,yb,yc)-oy)/cell));
  for(let j=j0;j<=j1;j++)layers[j].push(t);
 }
 const rows:number[][]=Array.from({length:nz},()=>[]);
 for(let j=0;j<ny;j++){
  const y=oy+j*cell+1e-7;for(const row of rows)row.length=0;
  for(const t of layers[j]){
   const v=[indices[t*3],indices[t*3+1],indices[t*3+2]],cut:number[]=[];
   for(let e=0;e<3;e++){const p=v[e],q=v[(e+1)%3],yp=positions[p*3+1],yq=positions[q*3+1];if((yp-y)*(yq-y)>=0)continue;const s=(y-yp)/(yq-yp);cut.push(positions[p*3]+(positions[q*3]-positions[p*3])*s,positions[p*3+2]+(positions[q*3+2]-positions[p*3+2])*s);}
   if(cut.length<4)continue;
   const [x1,z1,x2,z2]=cut,k0=Math.max(0,Math.ceil((Math.min(z1,z2)-oz)/cell)),k1=Math.min(nz-1,Math.floor((Math.max(z1,z2)-oz)/cell));
   for(let k=k0;k<=k1;k++){const z=oz+k*cell;if((z1-z)*(z2-z)>0||z1===z2)continue;rows[k].push(x1+(x2-x1)*(z-z1)/(z2-z1));}
  }
  for(let k=0;k<nz;k++){
   const xs=rows[k];if(xs.length<2)continue;xs.sort((p,q)=>p-q);
   for(let m=0;m+1<xs.length;m+=2){const i0=Math.max(0,Math.ceil((xs[m]-ox)/cell)),i1=Math.min(nx-1,Math.floor((xs[m+1]-ox)/cell));for(let i=i0;i<=i1;i++)inside[at(i,j,k)]=1;}
  }
 }
 // 2) 표면 가까이: 삼각형마다 band 칸만큼 넓힌 상자 안의 격자 꼭짓점까지 정확한 거리를 재고 가장 작은 값을 남긴다.
 for(let t=0;t<triangles;t++){
  const a=indices[t*3]*3,b=indices[t*3+1]*3,c=indices[t*3+2]*3;
  const minX=Math.min(positions[a],positions[b],positions[c])-reach,maxX=Math.max(positions[a],positions[b],positions[c])+reach;
  const minY=Math.min(positions[a+1],positions[b+1],positions[c+1])-reach,maxY=Math.max(positions[a+1],positions[b+1],positions[c+1])+reach;
  const minZ=Math.min(positions[a+2],positions[b+2],positions[c+2])-reach,maxZ=Math.max(positions[a+2],positions[b+2],positions[c+2])+reach;
  const i0=Math.max(0,Math.ceil((minX-ox)/cell)),i1=Math.min(nx-1,Math.floor((maxX-ox)/cell));
  const j0=Math.max(0,Math.ceil((minY-oy)/cell)),j1=Math.min(ny-1,Math.floor((maxY-oy)/cell));
  const k0=Math.max(0,Math.ceil((minZ-oz)/cell)),k1=Math.min(nz-1,Math.floor((maxZ-oz)/cell));
  if(i0>i1||j0>j1||k0>k1)continue;
  for(let j=j0;j<=j1;j++)for(let k=k0;k<=k1;k++)for(let i=i0;i<=i1;i++){
   const d=pointTriangleDistance(ox+i*cell,oy+j*cell,oz+k*cell,positions,a,b,c),n=at(i,j,k);if(d<data[n])data[n]=d;
  }
 }
 // 3) 그 바깥: 이웃 26칸을 따라 앞뒤로 두 번 쓸어 거리를 퍼뜨린다(챔퍼 거리). 가장자리 한 칸은 쓸지 않는다.
 const offsets:number[]=[],lengths:number[]=[];
 for(let dj=-1;dj<=1;dj++)for(let dk=-1;dk<=1;dk++)for(let di=-1;di<=1;di++){const index=dj*nz*nx+dk*nx+di;if(index<0){offsets.push(index);lengths.push(Math.hypot(di,dj,dk)*cell);}}
 const relax=(n:number,sign:number)=>{
  let best=data[n];const own=inside[n];
  for(let m=0;m<offsets.length;m++){const q=n+offsets[m]*sign;if(inside[q]!==own)continue;const candidate=data[q]+lengths[m];if(candidate<best)best=candidate;}
  data[n]=best;
 };
 for(let j=1;j<ny-1;j++)for(let k=1;k<nz-1;k++)for(let i=1;i<nx-1;i++)relax(at(i,j,k),1);
 for(let j=ny-2;j>=1;j--)for(let k=nz-2;k>=1;k--)for(let i=nx-2;i>=1;i--)relax(at(i,j,k),-1);
 for(let j=0;j<ny;j++)for(let k=0;k<nz;k++)for(let i=0;i<nx;i++){
  const n=at(i,j,k),d=Number.isFinite(data[n])?data[n]:reach*4,value=inside[n]?-d:d,g=((j+J0)*grid.nz+(k+K0))*grid.nx+(i+I0);
  if(value<target[g])target[g]=value;
 }
}

// 점 (px,py,pz)에서 삼각형 abc(positions 안의 시작 위치)까지의 거리. Ericson, Real-Time Collision Detection 5.1.5.
function pointTriangleDistance(px:number,py:number,pz:number,v:Float32Array,a:number,b:number,c:number){
 const abx=v[b]-v[a],aby=v[b+1]-v[a+1],abz=v[b+2]-v[a+2],acx=v[c]-v[a],acy=v[c+1]-v[a+1],acz=v[c+2]-v[a+2];
 const apx=px-v[a],apy=py-v[a+1],apz=pz-v[a+2];
 const d1=abx*apx+aby*apy+abz*apz,d2=acx*apx+acy*apy+acz*apz;
 let qx:number,qy:number,qz:number;
 if(d1<=0&&d2<=0){qx=v[a];qy=v[a+1];qz=v[a+2];}
 else{
  const bpx=px-v[b],bpy=py-v[b+1],bpz=pz-v[b+2],d3=abx*bpx+aby*bpy+abz*bpz,d4=acx*bpx+acy*bpy+acz*bpz;
  if(d3>=0&&d4<=d3){qx=v[b];qy=v[b+1];qz=v[b+2];}
  else{
   const vc=d1*d4-d3*d2;
   if(vc<=0&&d1>=0&&d3<=0){const t=d1/(d1-d3);qx=v[a]+abx*t;qy=v[a+1]+aby*t;qz=v[a+2]+abz*t;}
   else{
    const cpx=px-v[c],cpy=py-v[c+1],cpz=pz-v[c+2],d5=abx*cpx+aby*cpy+abz*cpz,d6=acx*cpx+acy*cpy+acz*cpz;
    if(d6>=0&&d5<=d6){qx=v[c];qy=v[c+1];qz=v[c+2];}
    else{
     const vb=d5*d2-d1*d6;
     if(vb<=0&&d2>=0&&d6<=0){const t=d2/(d2-d6);qx=v[a]+acx*t;qy=v[a+1]+acy*t;qz=v[a+2]+acz*t;}
     else{
      const va=d3*d6-d5*d4;
      if(va<=0&&d4-d3>=0&&d5-d6>=0){const t=(d4-d3)/((d4-d3)+(d5-d6));qx=v[b]+(v[c]-v[b])*t;qy=v[b+1]+(v[c+1]-v[b+1])*t;qz=v[b+2]+(v[c+2]-v[b+2])*t;}
      else{const denom=1/(va+vb+vc),s=vb*denom,w=vc*denom;qx=v[a]+abx*s+acx*w;qy=v[a+1]+aby*s+acy*w;qz=v[a+2]+abz*s+acz*w;}
     }
    }
   }
  }
 }
 const dx=px-qx,dy=py-qy,dz=pz-qz;return Math.sqrt(dx*dx+dy*dy+dz*dz);
}

// 삼선형 보간으로 거리와 기울기(바깥 방향)를 구한다. 격자 밖은 큰 양수(충돌 없음)로 본다. out에 [거리, gx, gy, gz]를 쓴다.
export function sampleSdf(sdf:BodySdf,x:number,y:number,z:number,out:Float32Array|Float64Array|number[]){
 const {origin,cell,nx,ny,nz,data}=sdf,fx=(x-origin[0])/cell,fy=(y-origin[1])/cell,fz=(z-origin[2])/cell;
 if(fx<0||fy<0||fz<0||fx>=nx-1||fy>=ny-1||fz>=nz-1){out[0]=1;out[1]=0;out[2]=0;out[3]=0;return out;}
 const i=Math.floor(fx),j=Math.floor(fy),k=Math.floor(fz),u=fx-i,v=fy-j,w=fz-k,sj=nz*nx,base=(j*nz+k)*nx+i;
 const c000=data[base],c100=data[base+1],c001=data[base+nx],c101=data[base+nx+1],c010=data[base+sj],c110=data[base+sj+1],c011=data[base+sj+nx],c111=data[base+sj+nx+1];
 const x00=c000+(c100-c000)*u,x01=c001+(c101-c001)*u,x10=c010+(c110-c010)*u,x11=c011+(c111-c011)*u;
 const y0=x00+(x10-x00)*v,y1=x01+(x11-x01)*v;
 out[0]=y0+(y1-y0)*w;
 const dx0=(c100-c000)+((c110-c010)-(c100-c000))*v,dx1=(c101-c001)+((c111-c011)-(c101-c001))*v;
 out[1]=(dx0+(dx1-dx0)*w)/cell;
 out[2]=((x10-x00)+((x11-x01)-(x10-x00))*w)/cell;
 out[3]=(y1-y0)/cell;
 return out;
}
