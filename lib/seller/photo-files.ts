// 상품 사진 파일 규칙. 판매자 브라우저(저장 전 확인)와 서버(올린 사진 검사)가 같은 규칙을 쓴다.
// 사진 한 면 = 옷 둘레로 자른 JPEG(긴 변 PHOTO_MAX_SIDE px 이하) + 같은 크기의 흑백 옷 마스크 PNG.
import {z} from 'zod';

export const PHOTO_MAX_SIDE=720;
export const PHOTO_LIMITS={imageChars:900_000,maskChars:160_000} as const;
const JPEG_DATA_URL=/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const PNG_DATA_URL=/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
export const PHOTO_VERSION=/^[A-Za-z0-9-]{1,40}$/;

export const productPhotoSchema=z.object({
 image:z.string().max(PHOTO_LIMITS.imageChars).regex(JPEG_DATA_URL),
 mask:z.string().max(PHOTO_LIMITS.maskChars).regex(PNG_DATA_URL),
}).strict();
export const productPhotosSchema=z.object({front:productPhotoSchema,back:productPhotoSchema.optional()}).strict();
export const photoUploadSchema=z.object({productId:z.string().trim().min(1).max(100),version:z.string().regex(PHOTO_VERSION),photos:productPhotosSchema}).strict();
export type PhotoUpload=z.infer<typeof photoUploadSchema>;

// data URL → [MIME, 바이트]. 서버가 사진을 그대로 내려줄 때 쓴다.
export function decodeDataUrl(value:string):{type:string;bytes:Uint8Array<ArrayBuffer>}|null{
 const match=/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);if(!match)return null;
 const binary=atob(match[2]),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return {type:match[1],bytes};
}
export const newPhotoVersion=()=>`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
