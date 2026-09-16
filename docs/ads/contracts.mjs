// Executable design reference. The deployed site does not import this module yet.
import { z } from 'zod';

const text = (max) => z.string().trim().min(1, '내용을 입력해 주세요.').refine(
  value => [...value].length <= max, `${max}자 이내로 입력해 주세요.`);
const optionalText = (max) => text(max).nullable();

export const adRequestSchema = z.object({
  version: z.literal(1),
  storeName: text(40),
  product: z.object({
    name: text(80),
    category: z.enum(['top', 'bottom', 'hat']),
    color: text(40),
    features: z.array(text(100)).min(1).max(5),
    material: optionalText(100),
    priceKrw: z.number().int().min(0).max(100_000_000).nullable(),
    discountPercent: z.number().int().min(1).max(99).nullable(),
  }).strict(),
  campaign: z.object({
    channel: z.literal('instagram_post'),
    audience: text(80),
    tone: z.enum(['friendly', 'minimal', 'energetic']),
    purpose: z.enum(['product_intro', 'new_arrival', 'promotion']),
    cta: z.enum(['view_product', 'visit_store', 'inquire']),
    additionalRequest: optionalText(300),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.campaign.purpose === 'promotion' && value.product.discountPercent === null) {
    ctx.addIssue({code:'custom', path:['product','discountPercent'], message:'할인 홍보에는 확인한 할인율이 필요해요.'});
  }
});

const angles = ['product_facts', 'styling', 'daily_scene'];
export const adResponseSchema = z.object({
  drafts: z.array(z.object({
    angle: z.enum(angles),
    headline: text(40),
    body: text(220),
    cta: text(40),
    hashtags: z.array(text(20).refine(value => /^[\p{L}\p{N}_]+$/u.test(value),
      '#과 공백 없이 한글·영문·숫자·밑줄만 사용해 주세요.')).min(3).max(6),
  }).strict()).length(3),
}).strict().superRefine((value, ctx) => {
  const found = new Set(value.drafts.map(draft => draft.angle));
  if (found.size !== 3) ctx.addIssue({code:'custom',path:['drafts'],message:'상품 특징·코디 제안·일상 장면을 각각 한 개씩 제안해 주세요.'});
  if (new Set(value.drafts.map(draft => draft.headline)).size !== 3) {
    ctx.addIssue({code:'custom',path:['drafts'],message:'서로 다른 제목의 초안이 필요해요.'});
  }
  value.drafts.forEach((draft, index) => {
    if (new Set(draft.hashtags).size !== draft.hashtags.length) {
      ctx.addIssue({code:'custom',path:['drafts',index,'hashtags'],message:'중복 해시태그를 제거해 주세요.'});
    }
  });
});
