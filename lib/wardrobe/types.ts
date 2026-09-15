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
  elasticWaist?: boolean; adjustableHat?: boolean; note?: string;
  measurementBasis?: string; image: string;
};
export type Outfit = Partial<Record<Slot, { productId: string; size: string }>>;
export type FitEstimate = { label: string; value: number | null; unit: string; detail: string; source?: InputSource; kind: 'difference' | 'length' | 'unavailable' };
