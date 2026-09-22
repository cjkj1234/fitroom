import {z} from 'zod';
import {adDraftSchema,adRequestSchema,type AdDraft,type AdRequest} from './contracts';

export const AD_EVALUATIONS_STORAGE_KEY='fitroom.ads.evaluations.v1';

const score=z.number().int().min(1).max(5);
export const manualAdReviewSchema=z.object({
 factPreservation:score,
 toneMatch:score,
 usefulness:score,
 notes:z.string().trim().max(500),
}).strict();
const adEvaluationRecordSchema=z.object({
 id:z.string().min(1).max(120),
 createdAt:z.string().datetime(),
 model:z.string().min(1).max(80),
 promptVersion:z.string().min(1).max(80),
 durationMs:z.number().int().min(0).max(120_000),
 request:adRequestSchema,
 drafts:z.array(adDraftSchema).length(3),
 review:manualAdReviewSchema,
}).strict();
const adEvaluationLogSchema=z.object({version:z.literal(1),records:z.array(adEvaluationRecordSchema).max(50)}).strict();

export type ManualAdReview=z.infer<typeof manualAdReviewSchema>;
export type AdEvaluationRecord=z.infer<typeof adEvaluationRecordSchema>;
export type AdEvaluationLog=z.infer<typeof adEvaluationLogSchema>;
export type GenerationEvidence={request:AdRequest;drafts:AdDraft[];model:string;promptVersion:string;durationMs:number};

export function createAdEvaluationLog():AdEvaluationLog{return {version:1,records:[]};}

export function parseStoredAdEvaluations(raw:string|null):AdEvaluationLog{
 if(!raw)return createAdEvaluationLog();
 try{const parsed=adEvaluationLogSchema.safeParse(JSON.parse(raw));return parsed.success?parsed.data:createAdEvaluationLog();}catch{return createAdEvaluationLog();}
}

export function saveAdEvaluation(log:AdEvaluationLog,record:AdEvaluationRecord):AdEvaluationLog{
 const parsed=adEvaluationRecordSchema.safeParse(record);if(!parsed.success)return log;
 return {...log,records:[parsed.data,...log.records.filter(item=>item.id!==record.id)].slice(0,50)};
}

export function reviewAverage(review:ManualAdReview){return Math.round((review.factPreservation+review.toneMatch+review.usefulness)/3*10)/10;}

export function createAdEvaluationRecord(evidence:GenerationEvidence,review:ManualAdReview,id:string,createdAt=new Date().toISOString()):AdEvaluationRecord|null{
 const parsed=adEvaluationRecordSchema.safeParse({id,createdAt,...evidence,review});return parsed.success?parsed.data:null;
}
