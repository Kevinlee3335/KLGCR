import {z} from 'zod';
const result=z.object({integerDigits:z.string().regex(/^\d{1,10}$/).nullable(),decimalDigits:z.string().regex(/^\d{1,6}$/).nullable(),confidence:z.enum(['high','medium','low']),note:z.string().max(500),displayValue:z.string().regex(/^\d{1,10}(\.\d{1,6})?$/).nullable().optional(),displayUnit:z.enum(['kWh','MWh','GWh']).nullable().optional()});
export function meterOcrReading(value:unknown,readingDigits?:number|null,meterId?:string){const r=result.parse(value);if(readingDigits!=null&&(!Number.isInteger(readingDigits)||readingDigits<1||readingDigits>10))throw Error("Invalid digit count");
 if(meterId==='utm-pe46'){
  // PE46 displays delivered energy in GWh. Convert the original display once;
  // already-normalized kWh and manually saved readings must not be scaled again.
  const factor=r.displayUnit==='GWh'?1000000:r.displayUnit==='MWh'?1000:r.displayUnit==='kWh'?1:null;
  const reading=r.displayValue!=null&&factor!==null?Math.round(Number(r.displayValue)*factor):null;
  if(reading!==null&&(!Number.isSafeInteger(reading)||reading>1000000000))throw Error('Invalid meter reading');
  return {reading,confidence:reading===null?'low' as const:r.confidence,note:r.note+(reading===null?' PE46 display value or unit is unclear; check the original photo.':` PE46 ${r.displayValue} ${r.displayUnit} converted to ${reading} kWh. A four-decimal GWh display is equivalent to appending 00 to its digits.`)};
 }
 const digits=r.integerDigits;const incomplete=readingDigits!=null&&digits!==null&&digits.length<readingDigits;const reading=digits===null||incomplete?null:Number(readingDigits?digits.slice(0,readingDigits):digits);if(reading!==null&&reading>1000000000)throw Error('Invalid meter reading');return {reading,confidence:r.confidence,note:r.note+(incomplete?" Fewer digits than configured; check the photo and enter manually.":readingDigits?` Reading first ${readingDigits} whole digits.`:"")+(r.decimalDigits?' Red decimal digits '+r.decimalDigits+' excluded.':'')};}
