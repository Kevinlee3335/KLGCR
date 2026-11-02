import {describe,it,expect} from 'vitest';
import {meterOcrReading} from './meter-ocr-reading';
describe('whole-number meter OCR',()=>{
 it('converts PE46 GWh to kWh, equivalent to adding 00 after the four-decimal display digits',()=>{expect(meterOcrReading({integerDigits:'20281',decimalDigits:null,displayValue:'2.0281',displayUnit:'GWh',confidence:'high',note:''},null,'utm-pe46').reading).toBe(2028100)});
 it('never scales an already normalized PE46 kWh response again',()=>{expect(meterOcrReading({integerDigits:'2028100',decimalDigits:null,displayValue:'2028100',displayUnit:'kWh',confidence:'high',note:''},null,'utm-pe46').reading).toBe(2028100)});
 it('requires a clear display unit for PE46 rather than guessing a multiplier',()=>{expect(meterOcrReading({integerDigits:'20281',decimalDigits:null,confidence:'high',note:''},null,'utm-pe46').reading).toBeNull()});
 it('does not scale water or other electricity meters',()=>{const v={integerDigits:'370546',decimalDigits:'1',displayValue:'2.0281',displayUnit:'GWh',confidence:'high',note:''};expect(meterOcrReading(v,6,'utm-ab-water').reading).toBe(370546);expect(meterOcrReading({...v,integerDigits:'70764'},null,'bungalow-l3-e1').reading).toBe(70764)});
 it('excludes red decimal wheels from billing',()=>{expect(meterOcrReading({integerDigits:'44348',decimalDigits:'9',confidence:'high',note:''}).reading).toBe(44348)});
 it('uses per-meter digit counts before numeric conversion',()=>{const r={integerDigits:'0033178',decimalDigits:'9',confidence:'high',note:''};expect(meterOcrReading(r,6).reading).toBe(3317);expect(meterOcrReading(r,5).reading).toBe(331);expect(meterOcrReading({...r,integerDigits:'331'},4).reading).toBeNull()});
 it('does not truncate meters without red decimal digits',()=>{expect(meterOcrReading({integerDigits:'443489',decimalDigits:null,confidence:'high',note:''}).reading).toBe(443489)});
 it('does not guess unclear digits or accept an unseparated old response',()=>{expect(meterOcrReading({integerDigits:null,decimalDigits:'9',confidence:'low',note:''}).reading).toBeNull();expect(()=>meterOcrReading({reading:443489,confidence:'high',note:''})).toThrow()});
});
