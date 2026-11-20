import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@/app/(dashboard)/admin/cert-servicing/actions',()=>({scheduleComplianceCycle:vi.fn()}));
import {ComplianceCycleSchedule} from './compliance-cycle-schedule';
import type {ComplianceCycle} from '@/app/(dashboard)/admin/cert-servicing/record-model';
const cycle={id:'cycle',scheduled_on:'2026-11-25',scheduled_time:'09:30:00',schedule_notes:'Supplier confirmed',schedule_history:[{
 action:'scheduled',scheduled_on:'2026-11-25',scheduled_time:'09:30:00',notes:'Supplier confirmed',
 previous_date:null,previous_time:null,actor_username:'kevin',updated_at:'2026-11-20T04:00:00Z',
}]} as ComplianceCycle;
afterEach(cleanup);
it('offers the existing plan for rescheduling and a separate cancellation',()=>{
 render(<ComplianceCycleSchedule recordId="record" cycle={cycle} canEdit/>);
 expect(screen.getByLabelText('Scheduled date')).toHaveValue('2026-11-25');
 expect(screen.getByLabelText('Time (optional · MYT)')).toHaveValue('09:30');
 expect(screen.getByRole('button',{name:'Save schedule',hidden:true})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Cancel schedule',hidden:true})).toBeInTheDocument();
});
it('retains readable historical plans without editing controls',()=>{
 const {container}=render(<ComplianceCycleSchedule recordId="record" cycle={cycle} canEdit={false}/>);
 expect(container.querySelector('form')).toBeNull();
 expect(screen.getByText('Schedule history · 1')).toBeInTheDocument();
 expect(screen.getByText('25/11/2026 · 9:30 AM (MYT)')).toBeInTheDocument();
});
