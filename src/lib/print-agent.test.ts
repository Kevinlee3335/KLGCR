import {describe,it,expect} from 'vitest';
import {rentalPeriodsDue,newDeviceToken,tokenHash} from './print-agent';
import {defaultBillingConfig} from './billing-preview';
const config={...defaultBillingConfig,enabled:true,startPeriod:'2026-11',reviewedUntil:'2027-12-31',holidays:['2026-11-02'],time:'09:00'};
describe('rental agent dates',()=>{
 it('waits through Sunday, substitute holiday and configured time',()=>{for(const clock of [{date:'2026-11-01',time:'10:00'},{date:'2026-11-02',time:'10:00'},{date:'2026-11-03',time:'08:59'}])expect(rentalPeriodsDue(config,'2026-11',clock)).toEqual([]);expect(rentalPeriodsDue(config,'2026-11',{date:'2026-11-03',time:'09:00'})).toEqual(['2026-11'])});
 it('catches up on a permitted day after the office PC was offline',()=>{expect(rentalPeriodsDue(config,'2026-11',{date:'2026-12-03',time:'10:00'})).toEqual(['2026-11','2026-12'])});
 it('does not backfill months before activation or print outside reviewed dates',()=>{expect(rentalPeriodsDue(config,'2026-12',{date:'2026-12-03',time:'10:00'})).toEqual(['2026-12']);expect(rentalPeriodsDue({...config,reviewedUntil:''},'2026-11',{date:'2026-11-03',time:'10:00'})).toEqual([]);expect(rentalPeriodsDue({...config,enabled:false},'2026-11',{date:'2026-11-03',time:'10:00'})).toEqual([])});
 it('makes independent high-entropy device tokens and stores only their hash',()=>{const a=newDeviceToken(),b=newDeviceToken();expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(a).not.toBe(b);expect(tokenHash(a)).toHaveLength(64);expect(tokenHash(a)).not.toBe(a)});
});
