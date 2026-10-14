/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildReport } from "./reporting";
it.each(['morning_tasks','daily_summary'] as const)('uses the shared department/status report in manually generated %s',async kind=>{
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const rpc=vi.fn(async(name:string)=>({data:name==='daily_task_report_text'?'📋 DAILY TASKS\nADMIN TASK\nOPERATION TASK\nHOUSEKEEPING TASK\nCompleted (2)':null,error:null}));
 const db={rpc,from:(table:string)=>{
  const q:any={};
  for(const method of ['select','in','eq','lte','gte','lt','order'])q[method]=()=>q;
  q.then=(resolve:any)=>Promise.resolve({data:table==='admin_daily_tasks'?[{title:'Old completed today',status:'completed',task_date:'2026-01-01',completed_at:new Date().toISOString()},{title:'Historical completed',status:'completed',task_date:'2026-01-01',completed_at:'2026-01-01T12:00:00Z'}]:[],error:null}).then(resolve);
  return q;
 }};
 const report=await buildReport(db as unknown as SupabaseClient,kind,'AB');
 expect(rpc.mock.calls).toEqual([['materialize_recurring_tasks',{p_date:date}],['daily_task_report_text',{p_date:date}]]);
 expect(report.whatsappText).toContain('OPERATION TASK');expect(report.whatsappText).toContain('Completed (2)');
 expect(report.whatsappText).not.toContain('📋 ADMIN TASKS');
 expect(report.payload.admin_tasks).toHaveLength(1);
 expect(report.payload.admin_tasks[0].title).toBe('Old completed today');
});
