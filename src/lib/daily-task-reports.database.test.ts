// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, expect, it } from "vitest";
const db=new PGlite();
let today:string;
beforeAll(async()=>{
 await db.exec(`create role anon; create role authenticated;
 create type report_type as enum('morning_tasks','midday_update','daily_summary','progress_snapshot','inventory_report');
 create table profiles(id text primary key,full_name text);
 create table admin_daily_tasks(id bigint generated always as identity,title text,notes text,status text,assigned_to text,task_date date,task_category text,completed_at timestamptz,created_at timestamptz default now());
 create table blocks(id int,code text);
 create table maintenance_jobs(id text,job_no text,block_id int,room_no text,category text,status text,scheduled_for date,completed_at timestamptz,assigned_at timestamptz,assigned_to text,work_state text);
 create table inventory_items(id text,item_code text,description text,unit text,balance_qty numeric,reorder_level numeric,is_active boolean);
 create table inventory_issue_history(inventory_item_id text,job_id text,staff_id text,qty numeric,issued_at timestamptz);
 create table report_snapshots(report_type report_type,report_date date,block_group text,payload jsonb,whatsapp_text text,source text);
 create table materialized_dates(work_date date);
 create function materialize_recurring_tasks(p_date date) returns void language sql as $$insert into public.materialized_dates values(p_date)$$;`);
 await db.exec(readFileSync("src/test/fixtures/report-generators-before-daily-tasks.sql","utf8"));
 await db.exec(readFileSync("supabase/migrations/20261014081400_daily_task_scheduled_report_sections.sql","utf8"));
 today=(await db.query<{d:string}>("select ((now() at time zone 'Asia/Kuala_Lumpur')::date)::text d")).rows[0].d;
 await db.exec("insert into profiles values('staff','Faiz'),('cleaner','Nancy'); insert into blocks values(1,'A');");
 for(const category of ['admin','operation','housekeeping'])for(const status of ['pending','accepted','in_progress','completed','kiv']){
  await db.query("insert into admin_daily_tasks(title,status,assigned_to,task_date,task_category,completed_at) values($1,$2,'staff',$3,$4,case when $2='completed' then now() else null end)",[`${category}-${status}`,status,today,category]);
 }
 await db.query("insert into admin_daily_tasks(title,status,assigned_to,task_date,task_category,completed_at) values('Overdue work','in_progress','staff',$1::date-2,'operation',null),('Old completed today','completed','staff',$1::date-3,'operation',now()),('Historical done','completed','staff',$1::date-5,'operation',now()-interval '2 day'),('Future work','pending','staff',$1::date+1,'operation',null)",[today]);
 await db.query("insert into maintenance_jobs(id,job_no,block_id,room_no,category,status,scheduled_for,completed_at,assigned_at,assigned_to,work_state) values('job','JOB-1',1,'A101','Electrical','completed',$1,now(),now(),'staff','standard')",[today]);
},30000);
afterAll(async()=>{await db.close();});
it.each(['morning_tasks','daily_summary'])("includes all departments and statuses in %s while retaining maintenance",async(type)=>{
 await db.query("select generate_automatic_report($1::report_type)",[type]);
 const reports=await db.query<{whatsapp_text:string;block_group:string}>("select whatsapp_text,block_group from report_snapshots where report_type=$1::report_type",[type]);
 expect(reports.rows).toHaveLength(2);
 for(const row of reports.rows){
  for(const category of ['ADMIN TASK','OPERATION TASK','HOUSEKEEPING TASK'])expect(row.whatsapp_text).toContain(category);
  for(const status of ['Pending','Accepted','In Progress','Completed','KIV'])expect(row.whatsapp_text).toContain(status);
  for(const title of ['admin-pending','housekeeping-completed','Overdue work','Old completed today'])expect(row.whatsapp_text).toContain(title);
  expect(row.whatsapp_text).toContain('Faiz');expect(row.whatsapp_text).toContain('Work date:');expect(row.whatsapp_text).toContain('Overdue');
  expect(row.whatsapp_text).not.toContain('Historical done');expect(row.whatsapp_text).not.toContain('Future work');
  expect(row.whatsapp_text).toContain('Total: 17 | Completed: 4 | Not completed: 13');
  expect(row.whatsapp_text).toContain(type==='morning_tasks'?'9:30 AM':'4:50 PM');
  expect(row.whatsapp_text).toContain(`Completed Today: ${row.block_group==='AB'?1:0}`);
 }
 expect((await db.query("select count(*)::int n from admin_daily_tasks")).rows[0]).toEqual({n:19});
});
it("extends overall summary and keeps inventory reports separate",async()=>{
 await db.query('select generate_overall_daily_summary()');
 const row=(await db.query<{whatsapp_text:string}>("select whatsapp_text from report_snapshots where block_group='ALL' and report_type='daily_summary'")).rows[0];
 expect(row.whatsapp_text).toContain('DAILY TASKS');expect(row.whatsapp_text).toContain('JOB-1');
 const inventory=(await db.query<{whatsapp_text:string;block_group:string}>("select whatsapp_text,block_group from report_snapshots where report_type='inventory_report'")).rows[0];
 expect(inventory.whatsapp_text).toContain('Inventory Report');expect(inventory.whatsapp_text).not.toContain('DAILY TASKS');
 expect((await db.query("select count(*)::int n from materialized_dates")).rows[0]).toEqual({n:3});
});
it("also supports the shared-writer installation used by current repository migrations",async()=>{
 const source=readFileSync("supabase/migrations/20260929120000_fix_review_items_3_4_5_6.sql","utf8");
 const writer=source.match(/create or replace function public.write_daily_report[\s\S]*?end \$\$;/)![0];
 await db.exec(`create function public.daily_report_job_text(j public.maintenance_jobs) returns text language sql as $$select j.job_no$$;`);
 await db.exec(writer);
 await db.exec(`create or replace function public.generate_automatic_report(p_type public.report_type) returns void language sql as $$select public.write_daily_report(p_type,'ALL')$$;
 create or replace function public.generate_overall_daily_summary() returns void language sql as $$select public.write_daily_report('daily_summary','ALL')$$;`);
 await db.exec(readFileSync("supabase/migrations/20261014081400_daily_task_scheduled_report_sections.sql","utf8"));
 for(const type of ['morning_tasks','daily_summary']){
  await db.query("select generate_automatic_report($1::report_type)",[type]);
  const reports=await db.query<{whatsapp_text:string}>("select whatsapp_text from report_snapshots where report_type=$1::report_type and block_group='ALL'",[type]);
  const text=reports.rows.at(-1)!.whatsapp_text;
  expect(text).toContain('📋 DAILY TASKS');expect(text).toContain('HOUSEKEEPING TASK');expect(text).toContain('Faiz');expect(text).toContain('JOB-1');
  expect(text).not.toContain('📋 ADMIN TASKS');
 }
});
it("new helper obeys RLS and does not grant anonymous access",async()=>{
 await db.exec("alter table admin_daily_tasks enable row level security; create policy own on admin_daily_tasks for select to authenticated using(assigned_to='cleaner'); grant select on admin_daily_tasks,profiles to authenticated; set role authenticated;");
 const row=(await db.query<{text:string}>("select daily_task_report_text($1) as text",[today])).rows[0];
 expect(row.text).toContain('Total: 0');expect(row.text).not.toContain('Faiz');
 await db.exec('reset role; set role anon;');
 await expect(db.query("select daily_task_report_text($1)",[today])).rejects.toThrow(/permission denied/);
 await db.exec('reset role;');
});
