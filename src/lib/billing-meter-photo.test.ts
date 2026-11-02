import {describe,it,expect} from 'vitest';
import {applyNewMeterPhoto} from './billing-meter-photo';
const water={id:'water',label:'WATER',serial:'water-serial',unit:'m³' as const,rate:3.3,role:'charge' as const,prev:3303,curr:3313,confirmed:true,previousPhoto:'old',photo:'3313-photo',previousDate:'2026-09-01',currentDate:'2026-10-01'};
describe('successive meter photos',()=>{
 it('preserves the previous month when retaking a confirmed current photo',()=>{const next=applyNewMeterPhoto(water,'3317-photo','2026-10-14');expect(next).toMatchObject({prev:3303,previousPhoto:'old',previousDate:'2026-09-01',photo:'3317-photo',currentDate:'2026-10-14',curr:null,confirmed:false});const confirmed={...next,curr:3317,confirmed:true};expect(confirmed.curr-confirmed.prev!).toBe(14);expect(applyNewMeterPhoto(confirmed,'next-photo','2026-10-15')).toMatchObject({prev:3303,previousPhoto:'old',previousDate:'2026-09-01'})});
 it('preserves the previous month when replacing an unconfirmed image or retrying after failed OCR',()=>{const pending=applyNewMeterPhoto(water,'blurry','2026-10-14');expect(applyNewMeterPhoto({...pending,curr:3317},'clear','2026-10-14')).toMatchObject({prev:3303,previousPhoto:'old',previousDate:'2026-09-01',curr:null})});
 it('keeps previous values when there is no current reading to carry',()=>{expect(applyNewMeterPhoto({...water,curr:null,confirmed:false},'first','2026-10-14').prev).toBe(3303)});
});
