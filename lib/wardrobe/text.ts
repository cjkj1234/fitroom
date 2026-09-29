const DIGIT_HAS_FINAL_CONSONANT=new Set(['0','1','3','6','7','8']);

// 마지막 글자의 받침 유무로 목적격 조사(을/를)를 고른다. 한글과 숫자만 판별하고 그 밖의 글자는 '를'로 둔다.
export function objectParticle(word:string){
 const last=[...word.trim()].pop();
 if(!last)return '를';
 const code=last.charCodeAt(0);
 if(code>=0xac00&&code<=0xd7a3)return (code-0xac00)%28===0?'를':'을';
 return DIGIT_HAS_FINAL_CONSONANT.has(last)?'을':'를';
}
