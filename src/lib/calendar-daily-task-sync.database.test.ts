// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, expect, it } from "vitest";
const db = new PGlite();
const ids = ['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
let today: string;
beforeAll(async () => {
 await db.exec(`create role authenticated; create role anon; create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function public.is_admin() returns boolean language sql as $$select auth.uid() is null$$;
 create table profiles(id uuid primary key,full_name text,role text,daily_task_category text,is_active boolean default true,deleted_at timestamptz);
 create table recurring_daily_tasks(id uuid primary key,title text,notes text,assigned_to uuid,created_by uuid,frequency text,day_number int,starts_on date,task_category text,is_active boolean default true);
 create table calendar_events(id uuid primary key,title text,notes text,assigned_to uuid,created_by uuid,audience text,event_type text,starts_at timestamptz,ends_at timestamptz);
 create table admin_daily_tasks(id bigint generated always as identity,task_date date,title text,notes text,assigned_to uuid,created_by uuid,recurrence_id uuid,task_category text,status text default 'pending',created_at timestamptz default now(),completed_at timestamptz,unique(recurrence_id,task_date));
 create type report_type as enum('morning_tasks','midday_update','daily_summary','progress_snapshot','inventory_report');
 create table blocks(id int,code text);
 create table maintenance_jobs(id text,job_no text,block_id int,room_no text,category text,status text,scheduled_for date,completed_at timestamptz,assigned_at timestamptz,assigned_to uuid,work_state text);
 create table inventory_items(id text,item_code text,description text,unit text,balance_qty numeric,reorder_level numeric,is_active boolean);
 create table inventory_issue_history(inventory_item_id text,job_id text,staff_id uuid,qty numeric,issued_at timestamptz);
 create table report_snapshots(report_type report_type,report_date date,block_group text,payload jsonb,whatsapp_text text,source text);`);
 await db.exec(readFileSync('supabase/migrations/20261007151500_fix_cleaner_recurring_task_materialization.sql','utf8'));
 await db.exec(readFileSync('src/test/fixtures/report-generators-before-daily-tasks.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261014081400_daily_task_scheduled_report_sections.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261014082333_calendar_work_daily_task_sync.sql','utf8'));
 today = (await db.query<{d:string}>("select ((now() at time zone 'Asia/Kuala_Lumpur')::date)::text d")).rows[0].d;
 for (let i=0;i<3;i++) await db.query('insert into profiles(id,full_name,role) values($1,$2,$3)',[ids[i],['Office','Faiz','Nancy'][i],['admin','maintenance_staff','cleaner'][i]]);
 await db.query("insert into admin_daily_tasks(title,task_date,assigned_to,task_category) values('Once work',$1,$2,'operation')",[today,ids[1]]);
 await db.query("insert into recurring_daily_tasks(id,title,assigned_to,created_by,frequency,day_number,starts_on,task_category) values('10000000-0000-4000-8000-000000000001','Repeating work',$1,$1,'weekly',extract(dow from $2::date),$2,'operation')",[ids[1],today]);
 await db.query("insert into calendar_events(id,title,assigned_to,created_by,audience,event_type,starts_at,ends_at) values('20000000-0000-4000-8000-000000000001','Calendar Work',$1,$1,'individual','work',($2||'T09:00:00+08:00')::timestamptz,($2||'T23:59:59+08:00')::timestamptz),('20000000-0000-4000-8000-000000000002','Shared Work',null,$1,'all_staff','work',($2||'T09:00:00+08:00')::timestamptz,($2||'T23:59:59+08:00')::timestamptz),('20000000-0000-4000-8000-000000000003','Meeting',null,$1,'all_staff','meeting',($2||'T09:00:00+08:00')::timestamptz,null)",[ids[1],today]);
},30000);
afterAll(async()=>{await db.close();});
it('limits employee materialization to own work and rejects future work',async()=>{
 await db.query("select set_config('test.uid',$1,false)",[ids[2]]);
 await db.query('select materialize_recurring_tasks($1)',[today]);
 expect((await db.query<{assigned_to:string}>('select assigned_to from admin_daily_tasks where calendar_event_id is not null')).rows).toEqual([{assigned_to:ids[2]}]);
 await expect(db.query('select materialize_recurring_tasks($1::date+1)',[today])).rejects.toThrow('due date');
 await db.query("select set_config('test.uid','',false)");
});
it.each(['morning_tasks','daily_summary'])('materializes calendar and repeating work before %s',async type=>{
 await db.query('select generate_automatic_report($1::report_type)',[type]);
 const rows=(await db.query<{whatsapp_text:string}>('select whatsapp_text from report_snapshots where report_type=$1::report_type',[type])).rows;
 expect(rows).toHaveLength(2);
 for (const {whatsapp_text:text} of rows) {
  for (const title of ['Once work','Repeating work','Calendar Work','Shared Work']) expect(text).toContain(title);
  for (const name of ['Office','Faiz','Nancy']) expect(text).toContain(name);
  expect(text).not.toContain('- Meeting');
 }
 expect((await db.query('select count(*)::int n from admin_daily_tasks')).rows[0]).toEqual({n:6});
});
it('keeps status and history on repeated sync and calendar removal',async()=>{
 await db.exec("update admin_daily_tasks set status='completed',notes='Finished' where title='Calendar Work'");
 await db.query('select materialize_recurring_tasks($1)',[today]);
 expect((await db.query("select status,notes from admin_daily_tasks where title='Calendar Work'")).rows).toEqual([{status:'completed',notes:'Finished'}]);
 await db.exec("delete from calendar_events where title='Calendar Work'");
 expect((await db.query("select count(*)::int n from admin_daily_tasks where title='Calendar Work'")).rows[0]).toEqual({n:1});
});

it('creates each Malaysia work date in a multi-day calendar range',async()=>{
 await db.query("insert into calendar_events(id,title,assigned_to,created_by,audience,event_type,starts_at,ends_at) values('20000000-0000-4000-8000-000000000004','Multi-day Work',$1,$1,'individual','work',($2::date+1)::timestamp at time zone 'Asia/Kuala_Lumpur',(($2::date+2)::timestamp+interval '23 hours') at time zone 'Asia/Kuala_Lumpur')",[ids[1],today]);
 for (const offset of [0,1,2,3]) await db.query('select materialize_recurring_tasks($1::date+$2::int)',[today,offset]);
 const rows=(await db.query<{offset:number}>("select task_date-$1::date as offset from admin_daily_tasks where title='Multi-day Work' order by task_date",[today])).rows;
 expect(rows).toEqual([{offset:1},{offset:2}]);
});

it('imports existing calendar work dates idempotently without overwriting tasks',async()=>{
 const sql=readFileSync('supabase/migrations/20261014082333_calendar_work_daily_task_sync.sql','utf8').split('-- CALENDAR WORK BACKFILL')[1];
 await db.exec(sql);
 const before=(await db.query('select count(*)::int n from admin_daily_tasks')).rows;
 await db.exec(sql);
 expect((await db.query('select count(*)::int n from admin_daily_tasks')).rows).toEqual(before);
 expect((await db.query("select count(*)::int n from admin_daily_tasks where title='Multi-day Work'")).rows[0]).toEqual({n:2});
 expect((await db.query("select status,notes from admin_daily_tasks where title='Calendar Work'")).rows).toEqual([{status:'completed',notes:'Finished'}]);
});
