import {describe,it,expect} from 'vitest';
import {membershipDashboard,monthSummary,filterMasterRecords} from './membership-master-dashboard';
import type {MasterResult} from './membership-master';
const result={layout:{sheets:[{cols:Array.from({length:33},()=>({width:70,hidden:true})),rows:[...Array.from({length:4},()=>({cells:[]})),{hidden:true,cells:[{v:1},{v:'2026 - 001'},{v:'ACTIVE'},{v:'Kevin (KLGCR / 123)'},{v:'A-10'},...Array.from({length:26},()=>({v:''})),{v:40},{v:40}]},{cells:[{v:2},{v:'2026 - 002'},{v:'REFUNDED'},{v:'Mary'},{v:'GYM01'}]},{cells:[{v:''},{v:'TOTAL'},{v:''},{v:''}]}]}]},totalRow:7} as unknown as MasterResult;
describe('membership dashboard',()=>{
 it('includes hidden records, separates months and excludes totals',()=>{const d=membershipDashboard(result);expect(d.records).toHaveLength(2);expect(d.months.at(-1)).toBe('2026-11');expect(d.records[0].name).toBe('Kevin');expect(d.records[0].originalName).toContain('123');expect(monthSummary(d.records,'2026-10')).toEqual({total:40,paid:1});expect(monthSummary(d.records,'2026-11')).toEqual({total:40,paid:1});});
 it('searches notes and reference and combines status with selected month payment',()=>{const {records}=membershipDashboard(result);expect(filterMasterRecords(records,'2026-10','123','paid','ACTIVE')).toHaveLength(1);expect(filterMasterRecords(records,'2026-10','gym01','missing','REFUNDED')[0].name).toBe('Mary');expect(filterMasterRecords(records,'2026-09','','paid','all')).toHaveLength(0);});
});
