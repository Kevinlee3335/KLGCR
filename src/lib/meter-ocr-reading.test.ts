import {describe,it,expect} from 'vitest';
import {meterOcrReading} from './meter-ocr-reading';
describe('whole-number meter OCR',()=>{
 it('excludes red decimal wheels from billing',()=>{expect(meterOcrReading({integerDigits:'44348',decimalDigits:'9',confidence:'high',note:''}).reading).toBe(44348)});
 it('uses per-meter digit counts before numeric conversion',()=>{const r={integerDigits:'0033178',decimalDigits:'9',confidence:'high',note:''};expect(meterOcrReading(r,6).reading).toBe(3317);expect(meterOcrReading(r,5).reading).toBe(331);expect(meterOcrReading({...r,integerDigits:'331'},4).reading).toBeNull()});
 it('does not truncate meters without red decimal digits',()=>{expect(meterOcrReading({integerDigits:'443489',decimalDigits:null,confidence:'high',note:''}).reading).toBe(443489)});
 it('does not guess unclear digits or accept an unseparated old response',()=>{expect(meterOcrReading({integerDigits:null,decimalDigits:'9',confidence:'low',note:''}).reading).toBeNull();expect(()=>meterOcrReading({reading:443489,confidence:'high',note:''})).toThrow()});
});
