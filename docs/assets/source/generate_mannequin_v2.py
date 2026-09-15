"""Create a CC0 MakeHuman mannequin GLB. Dependencies: numpy, scipy, Pillow.
Run in this directory after downloading base.obj from the URL in PROVENANCE.md.
The six morphs are illustrative local shape deformations, not fitted anthropometry.
"""
from pathlib import Path
import numpy as np, json, struct, hashlib
from scipy.sparse import coo_matrix
from PIL import Image,ImageDraw
P=Path(__file__).parent
verts=[]; faces=[]; group=''
for line in (P/'base.obj').read_text().splitlines():
 if line.startswith('v '): verts.append(list(map(float,line.split()[1:])))
 elif line.startswith('g '): group=line[2:].strip()
 elif line.startswith('f ') and group=='body':
  q=[int(x.split('/')[0])-1 for x in line.split()[1:]]
  faces.extend([[q[0],q[i],q[i+1]] for i in range(1,len(q)-1)])
verts=np.array(verts); faces=np.array(faces)
used=np.unique(faces); remap=np.full(len(verts),-1); remap[used]=np.arange(len(used)); f=remap[faces]; v=verts[used].copy()
v[:,1]-=v[:,1].min();v*=1.75/v[:,1].max()
# Softly remove small surface anatomy on the chest, navel and crotch.
# This retains torso volume while removing nipple and genital-surface detail.
a=np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);a=np.concatenate([a,a[:,::-1]])
adj=coo_matrix((np.ones(len(a)),(a[:,0],a[:,1])),shape=(len(v),len(v))).tocsr();adj.data[:]=1
val=np.asarray(adj.sum(1)).ravel()
x,y,z=v.T
chest=np.exp(-((y-1.265)/.115)**6)*np.exp(-(x/.20)**8)*np.clip((z-.00)/.05,0,1)
navel=np.exp(-((y-1.08)/.095)**4)*np.exp(-(x/.07)**4)*np.clip((z+.015)/.05,0,1)
crotch=np.exp(-((y-.91)/.09)**4)*np.exp(-(x/.07)**4)*np.clip((z+.03)/.05,0,1)
mask=np.maximum.reduce([chest,navel,crotch])
for _ in range(40): v += .32*mask[:,None]*((adj@v)/val[:,None]-v)
# Replace anterior chest detail with a smooth continuous elliptical mannequin shell.
x,y,z=v.T
blend=np.exp(-((y-1.29)/.13)**8)*np.clip((z+.005)/.04,0,1)*np.clip((.22-np.abs(x))/.035,0,1)
width=np.interp(y,[1.1,1.2,1.3,1.4,1.5],[.13,.155,.195,.21,.15])
depth=np.interp(y,[1.1,1.2,1.3,1.4,1.5],[.095,.105,.115,.10,.07])
shell=.012+depth*np.sqrt(np.clip(1-(x/width)**2,0,1))
v[:,2]=v[:,2]*(1-blend)+shell*blend
# smooth whole surface slightly; smooth vertex normals preserve detailed silhouette.
for _ in range(2):v += .1*((adj@v)/val[:,None]-v)
v[:,1]-=v[:,1].min();v*=1.75/v[:,1].max()
x,y,z=v.T

def normals(p):
 t=p[f]; n=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]); out=np.zeros_like(p)
 for j in range(3): np.add.at(out,f[:,j],n)
 return out/np.maximum(np.linalg.norm(out,axis=1)[:,None],1e-12)

def perimeter(p,h,cut):
 # Connect horizontal intersection segments by original mesh edges, then select
 # the component centered on the torso. This excludes independent arm sections.
 tri=p[f]; crossing=(tri[:,:,1].min(1)<h)&(tri[:,:,1].max(1)>=h); graph={}; points={}; segments=[]
 for ids,t in zip(f[crossing],tri[crossing]):
  pairs=[]
  for ai,bi in [(0,1),(1,2),(2,0)]:
   a,b=t[ai],t[bi]
   if (a[1]<h<=b[1]) or (b[1]<h<=a[1]):
    key=tuple(sorted((int(ids[ai]),int(ids[bi]))))
    points[key]=a+(b-a)*(h-a[1])/(b[1]-a[1]);pairs.append(key)
  if len(pairs)==2:
   a,b=pairs;graph.setdefault(a,[]).append(b);graph.setdefault(b,[]).append(a);segments.append((a,b))
 components=[];seen=set()
 for key in graph:
  if key in seen:continue
  stack=[key];comp=set()
  while stack:
   k=stack.pop()
   if k in seen:continue
   seen.add(k);comp.add(k);stack.extend(graph[k])
  mean=np.mean([points[k] for k in comp],axis=0)
  length=sum(np.linalg.norm(points[a]-points[b]) for a,b in segments if a in comp)
  components.append((abs(mean[0]),-length,length))
 return min(components)[2]

levels={'chest':1.30,'waist':1.12,'hips':.95}
cuts={'chest':.225,'waist':.22,'hips':.24}
# Bake UI default measurements directly into the neutral torso geometry.
# Region membership follows the original body to keep separated arms unaffected.
source_x=v[:,0].copy()
gate=1-np.clip((np.abs(source_x)-.18)/.065,0,1)
ui_ref={'height':175,'chest':96,'waist':80,'hips':98,'shoulders':43,'armLength':59,'waistHeight':105,'head':57}
scales={'chest':50,'waist':60,'hips':55,'shoulders':10,'armLength':15,'legLength':20,'head':13}
def region(name):
 h=levels[name];width={'chest':.135,'waist':.125,'hips':.135}[name]
 return np.exp(-((v[:,1]-h)/width)**4)*gate
for _ in range(5):
 current={name:perimeter(v,h,cuts[name]) for name,h in levels.items()}
 deltas=[]
 for name,h in levels.items():
  factor=(ui_ref[name]/100-current[name])/current[name]
  d=np.zeros_like(v);band=region(name);d[:,0]=v[:,0]*factor*band;d[:,2]=(v[:,2]-.015)*factor*band;deltas.append(d)
 v+=sum(deltas)
# Head circumference is an XZ section through the cranium at Y=1.66 m.
head_level=1.66
head_gate=np.clip((v[:,1]-1.49)/.075,0,1);head_gate=head_gate*head_gate*(3-2*head_gate)
head_before=perimeter(v,head_level,1)
head_factor=.57/head_before-1
v[:,0]*=1+head_factor*head_gate;v[:,2]=.035+(v[:,2]-.035)*(1+head_factor*head_gate)
x,y,z=v.T
measure={n:perimeter(v,h,cuts[n]) for n,h in levels.items()}
targets={}
for name,h in levels.items():
 d=np.zeros_like(v);factor=scales[name]/100/measure[name];band=region(name)
 d[:,0]=x*factor*band;d[:,2]=(z-.015)*factor*band
 # Adjust amplitude against the actual horizontal mesh section.
 gain=(perimeter(v+d,h,cuts[name])-measure[name])*100
 d*=scales[name]/gain
 targets[name]=d
shoulder=np.clip((np.abs(x)-.075)/.1,0,1)*np.exp(-((y-1.395)/.15)**2)
# Fully carry distal arm when widening shoulders.
shoulder=np.maximum(shoulder,np.clip((np.abs(x)-.18)/.075,0,1)*np.clip((y-.97)/.12,0,1))
d=np.zeros_like(v);d[:,0]=np.sign(x)*.05*shoulder;targets['shoulders']=d
arm=np.clip((np.abs(x)-.16)/.13,0,1)*np.clip((y-.95)/.10,0,1)
anchor=np.stack([np.sign(x)*.176,np.full(len(v),1.409),np.full(len(v),.015)],axis=1)
d=(v-anchor)*(.15/.4779)*arm[:,None];targets['armLength']=d
# Hip and everything above translate; soles stay on ground.
d=np.zeros_like(v);d[:,1]=.20*np.clip(y/1.05,0,1);targets['legLength']=d
d=np.zeros_like(v);d[:,0]=x*(13/57)*head_gate;d[:,2]=(z-.035)*(13/57)*head_gate;targets['head']=d
n=normals(v)
# GLB 2.0 buffer and accessors; POSITION and NORMAL deltas for smooth morph shading.
binary=bytearray();views=[];accessors=[]
def add(arr,kind,component=5126,target=None):
 arr=np.asarray(arr,dtype='<f4' if component==5126 else '<u4');
 while len(binary)%4:binary.append(0)
 offset=len(binary);binary.extend(arr.tobytes());view={'buffer':0,'byteOffset':offset,'byteLength':arr.nbytes}
 if target:view['target']=target
 vi=len(views);views.append(view)
 ac={'bufferView':vi,'componentType':component,'count':len(arr),'type':kind}
 if kind=='VEC3':ac.update(min=arr.min(0).tolist(),max=arr.max(0).tolist())
 ai=len(accessors);accessors.append(ac);return ai
pa=add(v,'VEC3',target=34962);na=add(n,'VEC3',target=34962);ia=add(f.ravel(),'SCALAR',5125,34963)
ts=[]
for name,d in targets.items():ts.append({'POSITION':add(d,'VEC3',target=34962),'NORMAL':add(normals(v+d)-n,'VEC3',target=34962)})
cal={'heightM':1.75,'frontAxis':'+Z','upAxis':'+Y','origin':'ground under body center',
 'referenceCircumferencesCm':{k:round(a*100,2) for k,a in measure.items()},
 'measurementLevelsM':levels,'referenceShoulderWidthCm':35.24,'referenceArmLengthCm':47.79,
 'referenceLegLengthCm':91.0,'uiReferenceCm':ui_ref,'headCircumferenceCm':round(perimeter(v,head_level,1)*100,3),'headMeasurementLevelM':head_level,'morphs':{},
 'limits':'Illustrative proportions only. Torso circumference uses horizontal mesh sections. Not validated body scanning, medical measurement, cloth simulation, or garment fit prediction.'}
for name,d in targets.items():
 data={'weightRange':[-1,1],'defaultWeight':0}
 if name in levels:data.update(approxCmPerWeight=round((perimeter(v+d,levels[name],cuts[name]) - measure[name])*100,2))
 else:data['approxCmPerWeight']=scales[name]
 data['uiCmPerWeight']=scales[name]
 cal['morphs'][name]=data
(P/'calibration-v2.json').write_text(json.dumps(cal,indent=2))
gltf={'asset':{'version':'2.0','generator':'Fitroom MakeHuman mannequin generator','copyright':'MakeHuman core mesh CC0 1.0 Universal'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0,'name':'Fitroom_Mannequin'}],'meshes':[{'name':'MakeHuman_Mannequin','weights':[0]*len(ts),'extras':{'targetNames':list(targets),'calibration':cal},'primitives':[{'attributes':{'POSITION':pa,'NORMAL':na},'indices':ia,'material':0,'targets':ts}]}],'materials':[{'name':'Neutral matte porcelain','pbrMetallicRoughness':{'baseColorFactor':[.72,.74,.72,1],'metallicFactor':0,'roughnessFactor':.82},'doubleSided':True}],'buffers':[{'byteLength':len(binary)}],'bufferViews':views,'accessors':accessors}
j=json.dumps(gltf,separators=(',',':')).encode();j+=b' '*((-len(j))%4);binary+=b'\0'*((-len(binary))%4)
(P/'mannequin-v2.glb').write_bytes(struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(binary))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(binary),b'BIN\0')+binary)
# Software shaded QA front and profile. Pure Pillow rasterization, no browser.
img=Image.new('RGB',(1200,1200),'#e5e5e1');draw=ImageDraw.Draw(img)
for col,ang in enumerate([0,np.pi/2]):
 r=np.array([[np.cos(ang),0,np.sin(ang)],[0,1,0],[-np.sin(ang),0,np.cos(ang)]])
 vv=v@r.T;tri=vv[f];nn=n@r.T;shade=np.clip(nn@np.array([-.4,.6,.7])*.45+.55,.15,1)
 for i in np.argsort(tri[:,:,2].mean(1)):
  t=tri[i];xy=[(round(a*590+300+col*600),round(1125-b*590)) for a,b,c in t];c=int(shade[f[i]].mean()*220);draw.polygon(xy,fill=(c,c,c))
draw.text((50,30),'MAKEHUMAN / NEUTRAL MANNEQUIN — FRONT + PROFILE',fill='#222222')
img.save(P/'mannequin-v2-qa.png')
report={'vertices':len(v),'triangles':len(f),'boundsMinM':v.min(0).tolist(),'boundsMaxM':v.max(0).tolist(),'glbBytes':(P/'mannequin-v2.glb').stat().st_size,'sourceSha256':hashlib.sha256((P/'base.obj').read_bytes()).hexdigest(),'morphTargetNames':list(targets),'finite':bool(np.isfinite(v).all() and all(np.isfinite(a).all() for a in targets.values()))}
(P/'qa-report-v2.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));print(json.dumps(cal,indent=2))
