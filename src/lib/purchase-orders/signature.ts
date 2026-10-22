import { z } from 'zod';
const point=z.tuple([z.number().finite().min(0).max(1),z.number().finite().min(0).max(1)]);
export const signatureSchema=z.object({strokes:z.array(z.array(point).min(2).max(600)).min(1).max(80)}).refine(v=>v.strokes.reduce((n,s)=>n+s.length,0)<=5000,'Signature is too detailed. Please draw it again.');
export type Signature=z.infer<typeof signatureSchema>;
