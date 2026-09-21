'use client';
import { useEffect,useRef,useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RotateCcw, Plus, Minus, Move, LoaderCircle } from 'lucide-react';
import type { BodyProfile,Outfit,Product } from '@/lib/wardrobe/types';
import { makeGarment,disposeGroup } from '@/lib/wardrobe/geometry';
export default function AvatarView({body,outfit,products,onDrop}:{body:BodyProfile;outfit:Outfit;products:Product[];onDrop:(id:string)=>void}){
 const host=useRef<HTMLDivElement>(null),api=useRef<{scene:THREE.Scene;camera:THREE.PerspectiveCamera;controls:OrbitControls;avatar:THREE.Group;clothes:THREE.Group;render:()=>void}|null>(null);
 const latest=useRef({body,outfit,products});latest.current={body,outfit,products};
 const [status,setStatus]=useState('loading'),[drag,setDrag]=useState(false),[view,setView]=useState('정면');
 function update(){const a=api.current;if(!a)return;const {body,outfit,products}=latest.current;
   const scale=body.measurements.height/175;a.avatar.scale.setScalar(scale);
   a.avatar.traverse(o=>{if(o instanceof THREE.Mesh && o.morphTargetDictionary && o.morphTargetInfluences){const b=body.measurements;const weights:Record<string,number>={chest:(b.chest/scale-96)/50,waist:(b.waist/scale-80)/60,hips:(b.hips/scale-98)/55,shoulders:(b.shoulders/scale-43)/10,armLength:(b.armLength/scale-59)/15,legLength:(b.legLength/scale-105)/20,head:(b.head/scale-57)/13};for(const [name,index]of Object.entries(o.morphTargetDictionary))o.morphTargetInfluences[index]=Math.max(-1,Math.min(1,weights[name]??0));}});
   let minY=Infinity,maxY=-Infinity;const vertex=new THREE.Vector3();a.avatar.traverse(o=>{if(o instanceof THREE.Mesh){const positions=o.geometry.getAttribute('position');for(let i=0;i<positions.count;i++){o.getVertexPosition(i,vertex);minY=Math.min(minY,vertex.y);maxY=Math.max(maxY,vertex.y);}}});if(Number.isFinite(minY)&&maxY>minY){a.avatar.scale.y=body.measurements.height/100/(maxY-minY);a.avatar.position.y=-minY*a.avatar.scale.y;}
   while(a.clothes.children.length){const item=a.clothes.children[0];a.clothes.remove(item);disposeGroup(item);}
   Object.values(outfit).forEach(item=>{const p=products.find(product=>product.id===item.productId);const s=p?.sizes.find(candidate=>candidate.label===item.size);if(p&&s)a.clothes.add(makeGarment(p,s,body));});a.render();
 }
 useEffect(()=>{
   const el=host.current;if(!el)return;let renderer:THREE.WebGLRenderer;
   try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{setStatus('error');return;}
   renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.setClearColor(0x000000,0);el.appendChild(renderer.domElement);
   const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(31,1,.01,20);camera.position.set(0,1.05,3.8);
   const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.87,0);controls.enablePan=false;controls.minDistance=2.0;controls.maxDistance=5;controls.minPolarAngle=.6;controls.maxPolarAngle=1.7;controls.update();
   scene.add(new THREE.HemisphereLight(0xffffff,0xaaaeb3,2.4));
   const key=new THREE.DirectionalLight(0xffffff,3.3);key.position.set(-2,4,3);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-2;key.shadow.camera.right=2;key.shadow.camera.top=3;key.shadow.camera.bottom=-1;key.shadow.bias=-.001;scene.add(key);
   const fill=new THREE.DirectionalLight(0xe1e6f1,1.5);fill.position.set(3,2,-2);scene.add(fill);
   const ground=new THREE.Mesh(new THREE.CircleGeometry(.65,64),new THREE.ShadowMaterial({opacity:.12}));ground.rotation.x=-Math.PI/2;ground.position.y=-.008;ground.receiveShadow=true;scene.add(ground);
   const avatar=new THREE.Group(),clothes=new THREE.Group();scene.add(avatar,clothes);
   const render=()=>renderer.render(scene,camera);api.current={scene,camera,controls,avatar,clothes,render};
   const resize=()=>{const w=el.clientWidth,h=el.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();};const observer=new ResizeObserver(resize);observer.observe(el);controls.addEventListener('change',render);resize();
   let disposed=false;new GLTFLoader().load('/models/mannequin.glb',g=>{if(disposed){disposeGroup(g.scene);return;}g.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.material=new THREE.MeshStandardMaterial({color:'#c9c7c4',roughness:.72});o.castShadow=true;o.receiveShadow=true;}});avatar.add(g.scene);setStatus('ready');update();},undefined,()=>setStatus('error'));
   return()=>{disposed=true;observer.disconnect();controls.dispose();disposeGroup(scene);renderer.dispose();renderer.domElement.remove();api.current=null;};
 },[]);
 useEffect(()=>{update();},[body,outfit,products]);
 function angle(label:string,r:number){const a=api.current;if(!a)return;const d=a.camera.position.distanceTo(a.controls.target);a.camera.position.set(Math.sin(r)*d,1.05,Math.cos(r)*d);a.controls.update();setView(label);a.render();}
 function zoom(f:number){const a=api.current;if(!a)return;const v=a.camera.position.clone().sub(a.controls.target);v.setLength(Math.max(2,Math.min(5,v.length()*f)));a.camera.position.copy(a.controls.target).add(v);a.controls.update();a.render();}
 return <div className={`avatar-stage ${drag?'is-dragging':''}`} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDrag(false);}} onDrop={e=>{e.preventDefault();setDrag(false);onDrop(e.dataTransfer.getData('text/plain'));}}>
   <div className="stage-top"><span className="tiny-label">FITTING STUDIO</span><span className="stage-badge">3D · 참고 실루엣</span></div>
   <div className="stage-caption"><h2>나에게 맞춰,<br/>새롭게 입어보기.</h2><p>옷을 끌어다 아바타에 놓아보세요.</p></div>
   <div ref={host} className="avatar-canvas" role="img" aria-label="마우스로 회전할 수 있는 내 체형의 3D 아바타"/>
   {status==='loading'&&<div className="stage-loading"><LoaderCircle className="spin"/> 아바타를 준비하고 있어요</div>}
   {status==='error'&&<div className="stage-loading error">3D 화면을 불러오지 못했어요.<br/>WebGL을 지원하는 브라우저에서 새로고침해 주세요.<br/>상품과 실측 정보는 계속 확인할 수 있어요.</div>}
   {drag&&<div className="drop-message">여기에 놓아 입어보기</div>}
   <div className="zoom-controls"><button aria-label="확대" onClick={()=>zoom(.85)}><Plus size={17}/></button><button aria-label="축소" onClick={()=>zoom(1.15)}><Minus size={17}/></button><button aria-label="시점 초기화" onClick={()=>angle('정면',0)}><RotateCcw size={16}/></button></div>
   <div className="stage-bottom"><span><Move size={13}/> 드래그로 회전 · 스크롤로 확대</span><div className="view-buttons">{[['정면',0],['옆면',Math.PI/2],['후면',Math.PI]].map(([label,r])=><button key={label} className={view===label?'active':''} onClick={()=>angle(String(label),Number(r))}>{label}</button>)}</div></div>
 </div>;
}
