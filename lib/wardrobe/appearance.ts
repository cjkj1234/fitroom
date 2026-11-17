// 아바타의 모습(피부색·머리 모양·머리색). 체형 치수와 따로 이 브라우저에만 저장한다.
// 핏 계산·천 시뮬레이션에는 쓰지 않는 표시용 설정이다.

export const SKIN_TONES=[
 {id:'fair',label:'밝은 피부',color:'#f1d3bf'},
 {id:'light',label:'밝은 중간 피부',color:'#e3b796'},
 {id:'medium',label:'중간 피부',color:'#c99470'},
 {id:'tan',label:'구릿빛 피부',color:'#a36c48'},
 {id:'deep',label:'짙은 피부',color:'#6b4630'},
] as const;
export const HAIR_STYLES=[
 {id:'short',label:'짧은 머리'},
 {id:'bob',label:'단발'},
 {id:'none',label:'머리카락 없음'},
] as const;
export const HAIR_COLORS=[
 {id:'black',label:'검은색',color:'#1c1714'},
 {id:'brown',label:'갈색',color:'#47301f'},
 {id:'light',label:'밝은 갈색',color:'#7b5536'},
] as const;

export type SkinToneId=typeof SKIN_TONES[number]['id'];
export type HairStyleId=typeof HAIR_STYLES[number]['id'];
export type HairColorId=typeof HAIR_COLORS[number]['id'];
export type Appearance={version:1;skinTone:SkinToneId;hairStyle:HairStyleId;hairColor:HairColorId};

export const DEFAULT_APPEARANCE:Appearance={version:1,skinTone:'light',hairStyle:'short',hairColor:'brown'};
export const APPEARANCE_KEY='fitroom.avatar.v1';

const has=<T extends {id:string}>(list:readonly T[],id:unknown):id is T['id']=>typeof id==='string'&&list.some(item=>item.id===id);

// 저장값이 없거나 깨졌으면 기본값, 일부 항목만 이상하면 그 항목만 기본값으로 되돌린다.
export function parseAppearance(value:string|null):Appearance{
 let raw:unknown;
 try{raw=JSON.parse(value??'null');}catch{return {...DEFAULT_APPEARANCE};}
 if(!raw||typeof raw!=='object')return {...DEFAULT_APPEARANCE};
 const a=raw as Partial<Appearance>;
 return {
  version:1,
  skinTone:has(SKIN_TONES,a.skinTone)?a.skinTone:DEFAULT_APPEARANCE.skinTone,
  hairStyle:has(HAIR_STYLES,a.hairStyle)?a.hairStyle:DEFAULT_APPEARANCE.hairStyle,
  hairColor:has(HAIR_COLORS,a.hairColor)?a.hairColor:DEFAULT_APPEARANCE.hairColor,
 };
}

export const skinColor=(a:Appearance)=>SKIN_TONES.find(t=>t.id===a.skinTone)!.color;
export const hairColor=(a:Appearance)=>HAIR_COLORS.find(t=>t.id===a.hairColor)!.color;
