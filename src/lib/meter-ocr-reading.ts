import {z} from 'zod';
const result=z.object({integerDigits:z.string().regex(/^\d{1,10}$/).nullable(),decimalDigits:z.string().regex(/^\d{1,6}$/).nullable(),confidence:z.enum(['high','medium','low']),note:z.string().max(500)});
export function meterOcrReading(value:unknown){const r=result.parse(value);const reading=r.integerDigits===null?null:Number(r.integerDigits);if(reading!==null&&reading>1000000000)throw Error('Invalid meter reading');return {reading,confidence:r.confidence,note:r.note+(r.decimalDigits?' Red decimal digits '+r.decimalDigits+' excluded.':'')};}
