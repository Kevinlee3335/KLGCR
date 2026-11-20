import {CalendarDays,ChevronDown,Clock,Save,X} from 'lucide-react';
import {scheduleComplianceCycle} from '@/app/(dashboard)/admin/cert-servicing/actions';
import {timestampLabel,type ComplianceCycle} from '@/app/(dashboard)/admin/cert-servicing/record-model';
import {complianceScheduleLabel} from '@/lib/compliance-schedule';
import {SubmitButton} from './submit-button';
import controls from './compliance-controls.module.css';
import styles from './compliance-cycle-schedule.module.css';

export function ComplianceScheduleHistory({cycle}:{cycle:ComplianceCycle}){
 const changes=cycle.schedule_history||[];
 if(!changes.length)return null;
 return <details className={styles.history}><summary>Schedule history · {changes.length}</summary><ol>{[...changes].reverse().map((change,index)=><li key={index}>
  <strong>{change.action==='cancelled'?'Schedule cancelled':change.action==='rescheduled'?'Rescheduled':'Scheduled'}</strong>
  <span>{change.action==='cancelled'?`Previously ${complianceScheduleLabel({scheduled_on:change.previous_date,scheduled_time:change.previous_time})}`:complianceScheduleLabel(change)}</span>
  {change.action==='rescheduled'&&change.previous_date&&<small>Previously {complianceScheduleLabel({scheduled_on:change.previous_date,scheduled_time:change.previous_time})}</small>}
  {change.notes&&<span>{change.notes}</span>}
  <small>{change.actor_username} · {timestampLabel(change.updated_at)}</small>
 </li>)}</ol></details>;
}
export function ComplianceCycleSchedule({recordId,cycle,canEdit}:{recordId:string;cycle:ComplianceCycle;canEdit:boolean}){
 return <div className={styles.workspace}>
  {canEdit&&<details className={styles.editor}>
   <summary className={styles.disclosure}><CalendarDays size={19} aria-hidden="true"/><span>{cycle.scheduled_on?'Reschedule / cancel schedule':'Schedule'}</span><ChevronDown size={18} aria-hidden="true"/></summary>
   <div className={styles.content}>
    <p className={styles.hint}><Clock size={16} aria-hidden="true"/>Set the planned visit date. Time is optional and uses Malaysia time.</p>
    <form action={scheduleComplianceCycle} className={styles.form}>
     <input type="hidden" name="recordId" value={recordId}/><input type="hidden" name="cycleId" value={cycle.id}/>
     <label className={controls.label}>Scheduled date<input className={controls.input} type="date" name="scheduledOn" defaultValue={cycle.scheduled_on||''} required/></label>
     <label className={controls.label}>Time (optional · MYT)<input className={controls.input} type="time" name="scheduledTime" defaultValue={cycle.scheduled_time?.slice(0,5)||''} step={60}/></label>
     <label className={`${controls.label} ${styles.full}`}>Schedule notes (optional)<textarea className={controls.input} name="scheduleNotes" rows={2} maxLength={2000} defaultValue={cycle.schedule_notes||''} placeholder="e.g. Supplier confirmed the morning visit"/></label>
     <div className={styles.full}><SubmitButton className={`${controls.button} ${controls.primary}`} pendingText="Saving schedule…"><Save size={17} aria-hidden="true"/>Save schedule</SubmitButton></div>
    </form>
    {cycle.scheduled_on&&<form action={scheduleComplianceCycle} className={styles.cancel}>
     <input type="hidden" name="recordId" value={recordId}/><input type="hidden" name="cycleId" value={cycle.id}/><input type="hidden" name="mode" value="cancel"/>
     <SubmitButton className={`${controls.button} ${controls.secondary}`} pendingText="Cancelling…"><X size={16} aria-hidden="true"/>Cancel schedule</SubmitButton>
    </form>}
   </div>
  </details>}
  <ComplianceScheduleHistory cycle={cycle}/>
 </div>;
}
