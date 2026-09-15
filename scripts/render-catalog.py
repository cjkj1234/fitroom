"""Render real Three.js garment geometry with z-buffered, normal-shaded triangles."""
import json,os,math
import numpy as np
from PIL import Image
products=json.load(open('/private/tmp/fitroom-catalog.json'))
os.makedirs('public/catalog',exist_ok=True)
yaw=-.20;pitch=.08
R=np.array([[math.cos(yaw),0,math.sin(yaw)],[0,1,0],[-math.sin(yaw),0,math.cos(yaw)]])
P=np.array([[1,0,0],[0,math.cos(pitch),-math.sin(pitch)],[0,math.sin(pitch),math.cos(pitch)]])
resolution=720
for product in products:
    meshes=[];points=[]
    for mesh in product['meshes']:
        v=np.array(mesh['vertices'])@R.T@P.T;n=np.array(mesh['normals'])@R.T@P.T
        meshes.append((v,n,np.array(mesh['indices']).reshape(-1,3),np.array([int(mesh['color'][i:i+2],16) for i in (0,2,4)],dtype=float)));points.extend(v.tolist())
    points=np.array(points);ext=np.ptp(points[:,:2],axis=0);scale=resolution*.79/max(ext);center=(points[:,:2].min(0)+points[:,:2].max(0))/2
    canvas=np.full((resolution,resolution,3),[242,242,240],dtype=np.uint8);depth=np.full((resolution,resolution),-1e9)
    for v,n,faces,color in meshes:
        screen=(v[:,:2]-center)*scale;screen[:,1]*=-1;screen+=resolution/2
        for face in faces:
            t=screen[face];z=v[face,2];nn=n[face]
            lo=np.maximum(np.floor(t.min(0)).astype(int),0);hi=np.minimum(np.ceil(t.max(0)).astype(int),resolution-1)
            if np.any(hi<lo):continue
            x,y=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5)
            x0,y0=t[0];x1,y1=t[1];x2,y2=t[2];den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2)
            if abs(den)<1e-9:continue
            a=((y1-y2)*(x-x2)+(x2-x1)*(y-y2))/den;b=((y2-y0)*(x-x2)+(x0-x2)*(y-y2))/den;c=1-a-b
            zz=a*z[0]+b*z[1]+c*z[2];region=depth[lo[1]:hi[1]+1,lo[0]:hi[0]+1];inside=(a>=0)&(b>=0)&(c>=0)&(zz>region)
            if not inside.any():continue
            normals=a[...,None]*nn[0]+b[...,None]*nn[1]+c[...,None]*nn[2];normals/=np.maximum(np.linalg.norm(normals,axis=-1,keepdims=True),1e-9)
            light=.58+.42*np.abs(normals@np.array([-.42,.60,.68]));colors=np.clip(color[None,None,:]*light[...,None]+6,0,255).astype(np.uint8)
            canvas[lo[1]:hi[1]+1,lo[0]:hi[0]+1][inside]=colors[inside];region[inside]=zz[inside]
    Image.fromarray(canvas).resize((480,480),Image.Resampling.LANCZOS).save('public/catalog/'+product['id']+'.png')
print('Rendered',len(products),'z-buffered catalog images')
