'use client';
import { useEffect,useRef,useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RotateCcw, Plus, Minus, Move, LoaderCircle, Shirt } from 'lucide-react';
import type { BodyProfile,Outfit,Product } from '@/lib/wardrobe/types';
import { makeGarment,disposeGroup } from '@/lib/wardrobe/geometry';

function addStoreEnvironment(scene:THREE.Scene){
 const room=new THREE.Group();room.name='virtual-store-room';
 const floorMaterial=new THREE.MeshStandardMaterial({color:'#d9d3c9',roughness:.88});
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(5,4),floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.set(0,-.015,-.35);floor.receiveShadow=true;room.add(floor);
 const wallMaterial=new THREE.MeshStandardMaterial({color:'#ece9e3',roughness:.94});
 const wall=new THREE.Mesh(new THREE.PlaneGeometry(4.4,2.8),wallMaterial);wall.position.set(0,1.38,-1.05);wall.receiveShadow=true;room.add(wall);
 const mirror=new THREE.Mesh(new THREE.PlaneGeometry(1.05,2.2),new THREE.MeshPhysicalMaterial({color:'#cfd6d8',metalness:.25,roughness:.2}));mirror.position.set(0,1.16,-1.035);room.add(mirror);
 const frameMaterial=new THREE.MeshStandardMaterial({color:'#36383b',roughness:.6});
 const box=(width:number,height:number,depth:number,x:number,y:number,z:number)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),frameMaterial);mesh.position.set(x,y,z);mesh.castShadow=true;room.add(mesh);};
 box(1.16,.035,.035,0,.06,-1);box(1.16,.035,.035,0,2.26,-1);box(.035,2.24,.035,-.58,1.16,-1);box(.035,2.24,.035,.58,1.16,-1);
 for(const side of [-1,1]){box(.035,1.35,.035,side*1.15,.68,-.53);box(.035,1.35,.035,side*1.62,.68,-.53);box(.5,.035,.035,side*1.385,1.34,-.53);box(.5,.035,.34,side*1.385,.12,-.53);}
 const mat=new THREE.MeshStandardMaterial({color:'#b9a88e',roughness:.8});for(const x of [-1.9,1.9]){const panel=new THREE.Mesh(new THREE.BoxGeometry(.16,2.8,.08),mat);panel.position.set(x,1.38,-1);room.add(panel);}
 scene.add(room);
}

type StageApi={scene:THREE.Scene;camera:THREE.PerspectiveCamera;controls:OrbitControls;avatar:THREE.Group;clothes:THREE.Group;render:()=>void;clearHover:()=>void};

export default function AvatarView({body,outfit,products,storeName,onDrop,onGarmentClick}:{body:BodyProfile;outfit:Outfit;products:Product[];storeName:string;onDrop:(id:string)=>void;onGarmentClick?:(id:string)=>void}){
 const host=useRef<HTMLDivElement>(null),api=useRef<StageApi|null>(null);
 const latest=useRef({body,outfit,products});
 const clickRef=useRef(onGarmentClick),textureCache=useRef(new Map<string,THREE.Texture>()),textureLoading=useRef(new Set<string>());
 const [status,setStatus]=useState('loading'),[drag,setDrag]=useState(false),[view,setView]=useState('정면'),[hoverName,setHoverName]=useState<string|null>(null);
 function update(){const a=api.current;if(!a)return;const {body,outfit,products}=latest.current;
   const scale=body.measurements.height/175;a.avatar.scale.setScalar(scale);
   a.avatar.traverse(o=>{if(o instanceof THREE.Mesh && o.morphTargetDictionary && o.morphTargetInfluences){const b=body.measurements;const weights:Record<string,number>={chest:(b.chest/scale-96)/50,waist:(b.waist/scale-80)/60,hips:(b.hips/scale-98)/55,shoulders:(b.shoulders/scale-43)/10,armLength:(b.armLength/scale-59)/15,legLength:(b.legLength/scale-105)/20,head:(b.head/scale-57)/13};for(const [name,index]of Object.entries(o.morphTargetDictionary))o.morphTargetInfluences[index]=Math.max(-1,Math.min(1,weights[name]??0));}});
   let minY=Infinity,maxY=-Infinity;const vertex=new THREE.Vector3();a.avatar.traverse(o=>{if(o instanceof THREE.Mesh){const positions=o.geometry.getAttribute('position');for(let i=0;i<positions.count;i++){o.getVertexPosition(i,vertex);minY=Math.min(minY,vertex.y);maxY=Math.max(maxY,vertex.y);}}});if(Number.isFinite(minY)&&maxY>minY){a.avatar.scale.y=body.measurements.height/100/(maxY-minY);a.avatar.position.y=-minY*a.avatar.scale.y;}
   while(a.clothes.children.length){const item=a.clothes.children[0];a.clothes.remove(item);disposeGroup(item);}
   Object.values(outfit).forEach(item=>{const p=products.find(product=>product.id===item.productId);const s=p?.sizes.find(candidate=>candidate.label===item.size);if(p&&s)a.clothes.add(makeGarment(p,s,body,false,{frontTexture:textureFor(p)}));});a.clearHover();a.render();
 }
 // 평면 사진에서 만든 앞면 텍스처는 처음 쓸 때 불러와 캐시하고, 로드가 끝나면 옷을 다시 만든다. 그 전에는 색만으로 먼저 보여 준다.
 function textureFor(product:Product){
  if(!product.frontTexture)return undefined;
  const source=product.frontTexture,key=`${product.id}:${source.length}:${source.slice(-24)}`,cached=textureCache.current.get(key);
  if(cached)return cached;
  if(!textureLoading.current.has(key)){
   textureLoading.current.add(key);
   new THREE.TextureLoader().load(source,texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;textureCache.current.set(key,texture);textureLoading.current.delete(key);update();},undefined,()=>{textureLoading.current.delete(key);});
  }
  return undefined;
 }
 useEffect(()=>{
   const el=host.current;if(!el)return;let renderer:THREE.WebGLRenderer;
   try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{const timer=window.setTimeout(()=>setStatus('error'),0);return()=>window.clearTimeout(timer);}
   renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.setClearColor(0x000000,0);el.appendChild(renderer.domElement);
   const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(31,1,.01,20);camera.position.set(0,1.05,3.8);addStoreEnvironment(scene);
   // 부드러운 스튜디오 반사광: 원단과 마네킹의 음영이 납작해 보이지 않게 한다.
   const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environment=environment;scene.environmentIntensity=.3;
   const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.87,0);controls.enablePan=false;controls.minDistance=2.0;controls.maxDistance=5;controls.minPolarAngle=.6;controls.maxPolarAngle=1.7;controls.update();
   scene.add(new THREE.HemisphereLight(0xffffff,0xaaaeb3,1.15));
   const key=new THREE.DirectionalLight(0xffffff,2.9);key.position.set(-2,4,3);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-2;key.shadow.camera.right=2;key.shadow.camera.top=3;key.shadow.camera.bottom=-1;key.shadow.bias=-.0006;key.shadow.normalBias=.012;scene.add(key);
   const fill=new THREE.DirectionalLight(0xe1e6f1,1.4);fill.position.set(3,2,-2);scene.add(fill);
   const platform=new THREE.Mesh(new THREE.CylinderGeometry(.58,.6,.03,72),new THREE.MeshStandardMaterial({color:'#e6e2da',roughness:.55}));platform.position.y=-.015;platform.receiveShadow=true;scene.add(platform);
   const platformRing=new THREE.Mesh(new THREE.TorusGeometry(.586,.004,8,96),new THREE.MeshStandardMaterial({color:'#2557d6',roughness:.4,emissive:'#2557d6',emissiveIntensity:.25}));platformRing.rotation.x=Math.PI/2;platformRing.position.y=.001;scene.add(platformRing);
   const avatar=new THREE.Group(),clothes=new THREE.Group();scene.add(avatar,clothes);
   const render=()=>renderer.render(scene,camera);
   // 입은 옷 위에 커서를 올리면 강조하고, 짧게 클릭하면(회전 드래그가 아닐 때) 그 옷을 벗는다.
   const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let hoverId:string|null=null,downAt:{x:number;y:number;t:number}|null=null;
   const garmentAt=(event:PointerEvent)=>{
     const rect=renderer.domElement.getBoundingClientRect();if(!rect.width||!rect.height||!clothes.children.length)return null;
     pointer.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);
     let node:THREE.Object3D|null=raycaster.intersectObjects(clothes.children,true)[0]?.object??null;while(node&&node.parent!==clothes)node=node.parent;
     return node?node.name:null;
   };
   const setHover=(id:string|null)=>{
     if(id===hoverId)return;hoverId=id;
     clothes.children.forEach(group=>{const on=group.name===id;group.traverse(o=>{if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshStandardMaterial){o.material.emissive.set(on?0x1d3a8a:0x000000);o.material.emissiveIntensity=on?.5:0;}});});
     renderer.domElement.style.cursor=id?'pointer':'';setHoverName(id?latest.current.products.find(product=>product.id===id)?.name??null:null);render();
   };
   const dom=renderer.domElement;
   const onDown=(event:PointerEvent)=>{downAt={x:event.clientX,y:event.clientY,t:performance.now()};};
   const onUp=(event:PointerEvent)=>{const start=downAt;downAt=null;if(!start||event.button!==0)return;if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>5||performance.now()-start.t>600)return;const id=garmentAt(event);if(id)clickRef.current?.(id);};
   const onMove=(event:PointerEvent)=>{if(event.buttons!==0||event.pointerType==='touch')return;setHover(garmentAt(event));};
   const onLeave=()=>setHover(null);
   dom.addEventListener('pointerdown',onDown);dom.addEventListener('pointerup',onUp);dom.addEventListener('pointermove',onMove);dom.addEventListener('pointerleave',onLeave);
   api.current={scene,camera,controls,avatar,clothes,render,clearHover:()=>setHover(null)};
   const resize=()=>{const w=el.clientWidth,h=el.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();};const observer=new ResizeObserver(resize);observer.observe(el);controls.addEventListener('change',render);resize();
   let disposed=false;new GLTFLoader().load('/models/mannequin.glb',g=>{if(disposed){disposeGroup(g.scene);return;}g.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.material=new THREE.MeshPhysicalMaterial({color:'#d3cdc6',roughness:.58,clearcoat:.14,clearcoatRoughness:.5});o.castShadow=true;o.receiveShadow=true;}});avatar.add(g.scene);setStatus('ready');update();},undefined,()=>setStatus('error'));
   return()=>{disposed=true;observer.disconnect();dom.removeEventListener('pointerdown',onDown);dom.removeEventListener('pointerup',onUp);dom.removeEventListener('pointermove',onMove);dom.removeEventListener('pointerleave',onLeave);controls.dispose();disposeGroup(scene);textureCache.current.forEach(texture=>texture.dispose());textureCache.current.clear();environment.dispose();pmrem.dispose();renderer.dispose();renderer.domElement.remove();api.current=null;};
 },[]);
 useEffect(()=>{clickRef.current=onGarmentClick;});
 useEffect(()=>{latest.current={body,outfit,products};update();},[body,outfit,products]);
 function angle(label:string,r:number){const a=api.current;if(!a)return;const d=a.camera.position.distanceTo(a.controls.target);a.camera.position.set(Math.sin(r)*d,1.05,Math.cos(r)*d);a.controls.update();setView(label);a.render();}
 function zoom(f:number){const a=api.current;if(!a)return;const v=a.camera.position.clone().sub(a.controls.target);v.setLength(Math.max(2,Math.min(5,v.length()*f)));a.camera.position.copy(a.controls.target).add(v);a.controls.update();a.render();}
 return <div className={`avatar-stage ${drag?'is-dragging':''}`} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDrag(false);}} onDrop={e=>{e.preventDefault();setDrag(false);onDrop(e.dataTransfer.getData('text/plain'));}}>
   <div className="stage-top"><span className="tiny-label">{storeName} · FITTING ROOM</span><span className="stage-badge">3D · 가상 매장</span></div>
   <div className="stage-caption"><h2>매장에서 고른 옷을,<br/>내 아바타에게.</h2><p>상품을 누르거나 끌어다 놓아 입어보고, 입은 옷을 누르면 벗어요.</p></div>
   <div ref={host} className="avatar-canvas" role="img" aria-label="마우스로 회전할 수 있는 내 체형의 3D 아바타. 입은 옷을 누르면 벗을 수 있어요."/>
   {status==='loading'&&<div className="stage-loading"><LoaderCircle className="spin"/> 아바타를 준비하고 있어요</div>}
   {status==='error'&&<div className="stage-loading error">3D 화면을 불러오지 못했어요.<br/>WebGL을 지원하는 브라우저에서 새로고침해 주세요.<br/>상품과 실측 정보는 계속 확인할 수 있어요.</div>}
   {drag&&<div className="drop-message">여기에 놓아 입어보기</div>}
   {hoverName&&!drag&&<div className="garment-hint" role="status"><Shirt size={13}/>{hoverName} · 눌러서 벗기</div>}
   <div className="zoom-controls"><button aria-label="확대" onClick={()=>zoom(.85)}><Plus size={17}/></button><button aria-label="축소" onClick={()=>zoom(1.15)}><Minus size={17}/></button><button aria-label="시점 초기화" onClick={()=>angle('정면',0)}><RotateCcw size={16}/></button></div>
   <div className="stage-bottom"><span className="gesture-hint desktop"><Move size={13}/> 드래그로 회전 · 스크롤로 확대</span><span className="gesture-hint mobile"><Move size={13}/> 손가락으로 회전 · 두 손가락으로 확대</span><div className="view-buttons">{[['정면',0],['옆면',Math.PI/2],['후면',Math.PI]].map(([label,r])=><button key={label} className={view===label?'active':''} onClick={()=>angle(String(label),Number(r))}>{label}</button>)}</div></div>
 </div>;
}
