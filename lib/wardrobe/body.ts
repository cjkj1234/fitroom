import type { BodyKey, BodyProfile, InputSource } from './types';
export const BODY_FIELDS: { key: BodyKey; label: string; min: number; max: number; hint: string }[] = [
  {key:'height',label:'키',min:140,max:210,hint:'맨발로 선 키'},
  {key:'shoulders',label:'어깨너비',min:30,max:60,hint:'좌우 어깨 끝점 사이의 직선 길이'},
  {key:'chest',label:'가슴둘레',min:65,max:145,hint:'가슴의 가장 넓은 곳을 수평으로 한 바퀴'},
  {key:'waist',label:'허리둘레',min:50,max:140,hint:'배꼽 부근의 자연스러운 허리선'},
  {key:'hips',label:'엉덩이둘레',min:65,max:150,hint:'엉덩이의 가장 넓은 곳을 한 바퀴'},
  {key:'armLength',label:'팔 길이',min:40,max:85,hint:'어깨 끝에서 손목까지'},
  {key:'legLength',label:'허리 높이',min:65,max:135,hint:'허리선에서 바닥까지 수직 길이'},
  {key:'head',label:'머리둘레',min:45,max:70,hint:'눈썹 위와 뒤통수의 가장 넓은 곳'},
];
export const DEFAULT_BODY: BodyProfile = {version:1,measurements:{height:175,chest:96,waist:80,hips:98,shoulders:43,armLength:59,legLength:105,head:57},sources:Object.fromEntries(BODY_FIELDS.map(f=>[f.key,'simple'])) as Record<BodyKey,InputSource>};
export const STORAGE_KEY = 'fitroom.body.v1';
export function cloneBody(body: BodyProfile): BodyProfile {return {version:1,measurements:Object.fromEntries(BODY_FIELDS.map(f=>[f.key,body.measurements[f.key]])) as Record<BodyKey,number>,sources:Object.fromEntries(BODY_FIELDS.map(f=>[f.key,body.sources[f.key]])) as Record<BodyKey,InputSource>};}
export function validateBody(value: unknown): value is BodyProfile {
  if (!value || typeof value !== 'object') return false;
  const b = value as BodyProfile;
  return b.version === 1 && !!b.measurements && !!b.sources && BODY_FIELDS.every(f=>Number.isFinite(b.measurements[f.key]) && b.measurements[f.key]>=f.min && b.measurements[f.key]<=f.max && ['simple','manual','photo'].includes(b.sources[f.key])) && b.measurements.legLength < b.measurements.height * .72;
}
export function setMeasurement(body: BodyProfile, key: BodyKey, value: number, source: InputSource): BodyProfile {
  return {...body, measurements:{...body.measurements,[key]:value},sources:{...body.sources,[key]:source}};
}
export function makePreset(height: number, shape: 'slim'|'regular'|'broad'): BodyProfile {
  const b=cloneBody(DEFAULT_BODY), scale=height/175, girth={slim:.9,regular:1,broad:1.13}[shape];
  for(const f of BODY_FIELDS) b.measurements[f.key]=Math.round(DEFAULT_BODY.measurements[f.key]*scale*( ['chest','waist','hips'].includes(f.key)?girth:1)*10)/10;
  b.measurements.height=height;
  return b;
}
export function parseStoredBody(value: string | null): BodyProfile | null {try {const b=JSON.parse(value??'null');return validateBody(b)?cloneBody(b):null;}catch{return null;}}
export const sourceLabel: Record<InputSource,string> = {simple:'간편 추정',manual:'직접 입력',photo:'사진 추정'};
