import * as THREE from 'three';
import type { BodyProfile, Product, SizeMeasurements } from './types';

type Ring={y:number;rx:number;rz:number;x?:number;z?:number};
export function ringMesh(rings:Ring[],material:THREE.Material,segments=48):THREE.Mesh {
 const vertices:number[]=[],uv:number[]=[],indices:number[]=[];
 rings.forEach((r,j)=>{for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;vertices.push((r.x??0)+r.rx*Math.cos(a),r.y,(r.z??0)+r.rz*Math.sin(a));uv.push(i/segments,j/(rings.length-1));}});
 for(let j=0;j<rings.length-1;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
 const m=new THREE.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;return m;
}
function ellipseRadii(circ:number,ratio=.67){const rx=circ/(Math.PI*(3*(1+ratio)-Math.sqrt((3+ratio)*(1+3*ratio))));return [rx,rx*ratio];}
export function makeGarment(product:Product,size:SizeMeasurements,body:BodyProfile,thumbnail=false):THREE.Group {
 const group=new THREE.Group();group.name=product.id;
 const mat=new THREE.MeshStandardMaterial({color:product.color,roughness:.88,side:THREE.DoubleSide});
 const m=body.measurements,H=m.height/100,shoulderY=H*.815,waistY=m.legLength/100;
 if(product.slot==='top') {
   const c=(size.chestCirc??(size.chestFlat??53)*2)/100;
   const [rx,rz]=ellipseRadii(c),length=(size.length??70)/100,sw=(size.shoulder??50)/200;
   const top=shoulderY+.045, bottom=top-length;
   const rings=[{y:bottom,rx:rx*1.02,rz:rz*.94},{y:bottom+.03,rx:rx*1.02,rz:rz*.94},{y:bottom+length*.35,rx:rx*.98,rz:rz*.94},{y:shoulderY-.12,rx,rz},{y:shoulderY,rx:sw,rz:rz*.84},{y:top,rx:.068,rz:.061}];
   group.add(ringMesh(rings,mat));
   const cuff=new THREE.MeshStandardMaterial({color:product.color,roughness:1,side:THREE.DoubleSide});
   group.add(ringMesh([{y:top-.002,rx:.070,rz:.064},{y:top+.012,rx:.070,rz:.064}],cuff));
   for(const side of [-1,1]){
     const len=(size.sleeve??23)/100;
     const sleeve=ringMesh([{y:0,rx:.105,rz:.105},{y:-len*.65,rx:.095,rz:.10},{y:-len,rx:.087,rz:.096}],mat);
     sleeve.rotation.z=side*.68;sleeve.position.set(side*sw*.94,shoulderY-.01,0);group.add(sleeve);
   }
   if(product.silhouette==='stripe'){
     const stripeMat=new THREE.MeshStandardMaterial({color:'#37404d',roughness:.9,side:THREE.DoubleSide});
     const upper=shoulderY-.14;
     const at=(y:number)=>{let j=0;while(j<rings.length-2&&rings[j+1].y<y)j++;const a=rings[j],b=rings[j+1],t=(y-a.y)/(b.y-a.y);return {y,rx:a.rx+(b.rx-a.rx)*t+.0018,rz:a.rz+(b.rz-a.rz)*t+.0018};}; for(let y=bottom+.05;y<upper;y+=.04)group.add(ringMesh([at(y),at(y+.012)],stripeMat));
   }
 } else if(product.slot==='bottom'){
   const length=(size.length??105)/100,rise=(size.rise??30)/100;
   const hipCirc=(size.hipsFlat??((size.waistFlat??40)+12))*2/100;
   const [hipX,hipZ]=ellipseRadii(hipCirc,.75);
   const [waistX,waistZ]=ellipseRadii((size.waistFlat??40)*2/100,.75);
   const crotch=waistY-rise,hem=waistY-length,legX=hipX*.52;
   group.add(ringMesh([{y:crotch+.07,rx:hipX*.97,rz:hipZ*.9},{y:waistY-.12,rx:hipX,rz:hipZ},{y:waistY-.04,rx:waistX,rz:waistZ},{y:waistY,rx:waistX,rz:waistZ}],mat));
   const [hemX,hemZ]=ellipseRadii((size.hemFlat??24)*2/100,.75);
   // Visual thigh radii are derived from hip partition, never used by numerical fit calculations.
   for(const s of [-1,1]) group.add(ringMesh([{y:hem,x:s*legX,rx:hemX,rz:hemZ},{y:hem+.025,x:s*legX,rx:hemX,rz:hemZ},{y:(hem+crotch)/2,x:s*legX,rx:(hemX+hipX*.53)/2,rz:hipZ*.8},{y:crotch+.1,x:s*legX,rx:hipX*.54,rz:hipZ*.94}],mat));
   const seam=new THREE.MeshStandardMaterial({color:new THREE.Color(product.color).multiplyScalar(.88),roughness:.9,side:THREE.DoubleSide});
   group.add(ringMesh([{y:waistY-.036,rx:waistX*1.006,rz:waistZ*1.006},{y:waistY,rx:waistX*1.006,rz:waistZ*1.006}],seam));
 } else {
   const circ=(size.headCirc??57)/100;const [rx,rz]=ellipseRadii(circ,.9),base=H-.105;
   const dome=new THREE.Mesh(new THREE.SphereGeometry(1,48,24,0,Math.PI*2,0,Math.PI/2),mat);dome.scale.set(rx,.12,rz);dome.position.y=base;group.add(dome);
   const brim=new THREE.Mesh(new THREE.SphereGeometry(1,40,16),mat);brim.scale.set(rx*.97,.012,.104);brim.position.set(0,base+.005,rz*.83);brim.rotation.x=-.1;group.add(brim);
 }
 if(thumbnail){const box=new THREE.Box3().setFromObject(group),center=box.getCenter(new THREE.Vector3());group.position.sub(center);}
 return group;
}
export function disposeGroup(group:THREE.Object3D){const mats=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach((m:THREE.Material)=>mats.add(m));}});mats.forEach(m=>m.dispose());}
