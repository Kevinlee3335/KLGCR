export type ComplianceSchedule={scheduled_on?:string|null;scheduled_time?:string|null;schedule_notes?:string|null};
export type ComplianceScheduleChange={
 action:'scheduled'|'rescheduled'|'cancelled';scheduled_on:string|null;scheduled_time:string|null;notes:string|null;
 previous_date:string|null;previous_time:string|null;actor_username:string;updated_at:string;
};
export function complianceScheduleLabel(schedule:ComplianceSchedule){
 if(!schedule.scheduled_on)return null;
 const day=schedule.scheduled_on.slice(0,10).split('-').reverse().join('/');
 if(!schedule.scheduled_time)return day;
 const [hour,minute]=schedule.scheduled_time.split(':').map(Number);
 return `${day} · ${hour%12||12}:${String(minute).padStart(2,'0')} ${hour<12?'AM':'PM'} (MYT)`;
}
export function complianceScheduleRemarks(notes:string|null|undefined,schedule:ComplianceSchedule){
 const label=complianceScheduleLabel(schedule);
 if(!label)return notes??null;
 return [notes,`Scheduled: ${label}`,schedule.schedule_notes?`Schedule notes: ${schedule.schedule_notes}`:null].filter(Boolean).join('\n');
}
