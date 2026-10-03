import type { BottomSilhouette, TopSilhouette } from '../seller/photo-silhouette';

export type Slot = 'hat' | 'top' | 'bottom';
export type InputSource = 'simple' | 'manual' | 'photo';
export type BodyKey = 'height' | 'chest' | 'waist' | 'hips' | 'shoulders' | 'armLength' | 'legLength' | 'head';
export type BodyProfile = { version: 1; measurements: Record<BodyKey, number>; sources: Record<BodyKey, InputSource> };
export type SizeMeasurements = {
  label: string; length?: number; chestFlat?: number; chestCirc?: number;
  shoulder?: number; sleeve?: number; waistFlat?: number; hipsFlat?: number;
  thighFlat?: number; rise?: number; hemFlat?: number; headCirc?: number;
};
export type Product = {
  id: string; slot: Slot; brand: string; name: string; color: string; colorName: string;
  url: string; checkedAt: string; sizes: SizeMeasurements[]; defaultSize: string;
  silhouette: 'tee' | 'vneck' | 'stripe' | 'wide' | 'straight' | 'cap';
  // 실루엣과 별개로 그리는 세부 디자인. shirt는 오픈카라 셔츠(단추 여밈·가슴 주머니), carpenter는 카펜터/카고 주머니가 있는 바지.
  style?: 'shirt' | 'carpenter';
  // 판매자가 평면 촬영한 상의 사진에서 만든 앞면 텍스처(JPEG 데이터 주소). 이 탭 세션에서만 존재하며 서버·계정에는 없다.
  frontTexture?: string;
  // 판매자가 평면 촬영한 상의 사진에서 잰 몸판 실루엣 비율. 있으면 3D 상의 몸판 폭·겨드랑이 위치를 사진 모양대로 만든다.
  photoShape?: TopSilhouette;
  // 판매자가 평면 촬영한 바지 사진에서 잰 다리 폭·밑위·기장 비율. 있으면 3D 바지 다리가 사진처럼 좁아지거나 넓어지고, 실측이 빈 칸은 이 비율로 채운다.
  legShape?: BottomSilhouette;
  elasticWaist?: boolean; adjustableHat?: boolean; note?: string;
  measurementBasis?: string; image: string; source: 'demo' | 'seller';
  sellerProductId?: string; priceKrw?: number; stock?: number;
};
export type Outfit = Partial<Record<Slot, { productId: string; size: string }>>;
export type FitEstimate = { label: string; value: number | null; unit: string; detail: string; source?: InputSource; kind: 'difference' | 'length' | 'unavailable' };
