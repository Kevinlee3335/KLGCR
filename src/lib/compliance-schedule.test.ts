import {expect,it} from 'vitest';
import {complianceScheduleLabel,complianceScheduleRemarks} from './compliance-schedule';
it('displays local date-only and Malaysia times without timezone shifts',()=>{
 expect(complianceScheduleLabel({})).toBeNull();
 expect(complianceScheduleLabel({scheduled_on:'2026-11-25'})).toBe('25/11/2026');
 expect(complianceScheduleLabel({scheduled_on:'2026-11-25',scheduled_time:'00:00:00'})).toBe('25/11/2026 · 12:00 AM (MYT)');
 expect(complianceScheduleLabel({scheduled_on:'2026-11-25',scheduled_time:'12:30:00'})).toBe('25/11/2026 · 12:30 PM (MYT)');
});
it('keeps report notes and planned work together without implying completion',()=>{
 expect(complianceScheduleRemarks('Existing note',{})).toBe('Existing note');
 expect(complianceScheduleRemarks('Existing note',{scheduled_on:'2026-11-25',schedule_notes:'Supplier confirmed'}))
 .toBe('Existing note\nScheduled: 25/11/2026\nSchedule notes: Supplier confirmed');
});
