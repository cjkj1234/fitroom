import type { BodyProfile, FitEstimate, Outfit, Product, SizeMeasurements, Slot } from './types';
export function estimateFit(body: BodyProfile, product: Product, size: SizeMeasurements): FitEstimate[] {
  const b=body.measurements, results:FitEstimate[]=[];
  const unknown=(label:string,detail:string)=>results.push({label,value:null,unit:'',detail,kind:'unavailable'});
  const diff=(label:string,garment:number|undefined,key:'chest'|'waist'|'hips'|'head')=>garment===undefined?unknown(label,'비교에 필요한 상품 실측이 없어요.'):results.push({label,value:Math.round((garment-b[key])*10)/10,unit:'cm',detail:'의류 둘레 − 신체 둘레 · 착용감이 아닌 치수 차이',source:body.sources[key],kind:'difference'});
  if(product.slot==='top') {
    diff('가슴 여유',size.chestCirc ?? (size.chestFlat===undefined?undefined:size.chestFlat*2),'chest');
    // Shoulder seams (especially dropped shoulders) and sleeve conventions do not equal anatomical widths.
    if(size.shoulder!==undefined) results.push({label:'상품 어깨너비',value:size.shoulder,unit:'cm',detail:'어깨선 위치에 따라 달라 신체 어깨너비와 직접 비교하지 않아요.',kind:'length'});
  }
  if(product.slot==='bottom') {
    if(product.elasticWaist) unknown('허리 여유','밴딩의 최대 늘어남과 착용 위치가 확인되지 않아 판단을 보류해요.');
    else unknown('허리 여유','바지 허리선과 신체 측정 위치가 같다는 확인이 필요해요.');
    diff('엉덩이 여유',size.hipsFlat===undefined?undefined:size.hipsFlat*2,'hips');
  }
  if(product.slot==='hat') {
    if(product.adjustableHat) unknown('머리둘레 여유','조절 범위가 공개되지 않아 맞음 여부를 판단하지 않아요.');
    else diff('머리둘레 여유',size.headCirc,'head');
  }
  if(size.length!==undefined) results.push({label:product.slot==='top'?'상의 총장':'바지 총장',value:size.length,unit:'cm',detail:'상품 실측 길이 · 3D 기장은 참고 표현이에요.',kind:'length'});
  return results;
}
export function wear(outfit:Outfit,product:Product,size=product.defaultSize):Outfit {
  if(!product.sizes.some(s=>s.label===size)) throw new Error('등록되지 않은 사이즈입니다.');
  return {...outfit,[product.slot]:{productId:product.id,size}};
}
export function remove(outfit:Outfit,slot:Slot):Outfit {const next={...outfit};delete next[slot];return next;}
