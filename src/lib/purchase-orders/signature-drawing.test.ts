import {it,expect} from 'vitest';
import {signaturePoint,smoothSignatureStroke} from './signature-drawing';
it('maps the pointer to the actual scaled drawing surface, accounting for its border',()=>{
 expect(signaturePoint(252,162,{left:100,top:100,width:304,height:124},2)).toEqual([0.5,0.5]);
 expect(signaturePoint(-50,900,{left:100,top:100,width:300,height:120})).toEqual([0,1]);
});
it('smooths corners but preserves endpoints and keeps long strokes within the storage limit',()=>{
 const raw:[number,number][]=[[0.1,0.7],[0.3,0.1],[0.5,0.8],[0.9,0.3]];
 const smooth=smoothSignatureStroke(raw);
 expect(smooth[0]).toEqual(raw[0]);expect(smooth.at(-1)).toEqual(raw.at(-1));expect(smooth.length).toBeGreaterThan(raw.length);
 const long=Array.from({length:1000},(_,i)=>[i/999,0.5] as [number,number]);const result=smoothSignatureStroke(long);
 expect(result.length).toBeLessThanOrEqual(600);expect(result.at(-1)).toEqual([1,0.5]);
 expect(result.every(p=>p.every(n=>n>=0&&n<=1))).toBe(true);
});
