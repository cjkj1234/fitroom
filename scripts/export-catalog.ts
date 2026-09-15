import fs from 'node:fs';
import * as THREE from 'three';
import { PRODUCTS } from '../lib/wardrobe/catalog';
import { DEFAULT_BODY } from '../lib/wardrobe/body';
import { makeGarment } from '../lib/wardrobe/geometry';
const output=PRODUCTS.map(p=>{const g=makeGarment(p,p.sizes.find(s=>s.label===p.defaultSize)!,DEFAULT_BODY,true);g.updateMatrixWorld(true);const meshes:unknown[]=[];g.traverse(o=>{if(o instanceof THREE.Mesh){const v=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal');const vertices=[],normals=[];const normalMatrix=new THREE.Matrix3().getNormalMatrix(o.matrixWorld);for(let i=0;i<v.count;i++){const pt=new THREE.Vector3().fromBufferAttribute(v,i).applyMatrix4(o.matrixWorld);vertices.push([pt.x,pt.y,pt.z]);const normal=new THREE.Vector3().fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();normals.push([normal.x,normal.y,normal.z]);}meshes.push({vertices,normals,indices:Array.from(o.geometry.index!.array),color:(o.material as THREE.MeshStandardMaterial).color.getHexString()});}});return {id:p.id,meshes};});
fs.writeFileSync('/private/tmp/fitroom-catalog.json',JSON.stringify(output));
