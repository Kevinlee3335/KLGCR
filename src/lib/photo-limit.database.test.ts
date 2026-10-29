// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
const db=new PGlite();
const user='00000000-0000-4000-8000-000000000001';
const paths=Array.from({length:20},()=>`daily-tasks/1/${crypto.randomUUID()}.jpg`);
beforeAll(async()=>{
 await db.exec(`create role authenticated;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.photo_actor',true),'')::uuid $$;
 create table public.profiles(id uuid,is_active boolean,deleted_at timestamptz,role text);
 create table public.admin_daily_tasks(id bigint,assigned_to uuid,status text,completed_at timestamptz,updated_at timestamptz);
 create table storage.objects(bucket_id text,name text);
 create table public.daily_task_photos(task_id bigint,storage_path text unique,uploaded_by uuid);
 create table public.daily_task_activity(task_id bigint,action text,comment text,actor_id uuid);
 insert into profiles values('${user}',true,null,'maintenance_staff');
 insert into admin_daily_tasks values(1,'${user}','in_progress',null,null);
 set app.photo_actor='${user}';`);
 await db.exec(readFileSync('supabase/migrations/20261029081302_evidence_photo_limit_twenty.sql','utf8'));
 for(const path of paths)await db.query('insert into storage.objects values($1,$2)',['checkout-evidence',path]);
},30000);
afterAll(()=>db.close());
it('rejects 21 or incomplete photos without completing the task',async()=>{
 await expect(db.query('select complete_assigned_daily_task(1,$1,$2)',['Done',[...paths,`daily-tasks/1/${crypto.randomUUID()}.jpg`]])).rejects.toThrow('1 and 20');
 await expect(db.query('select complete_assigned_daily_task(1,$1,$2)',['Done',[`daily-tasks/1/${crypto.randomUUID()}.jpg`]])).rejects.toThrow('incomplete');
 expect((await db.query('select status from admin_daily_tasks')).rows).toEqual([{status:'in_progress'}]);
 expect((await db.query('select * from daily_task_photos')).rows).toHaveLength(0);
});
it('saves 20 verified photos and completes the task',async()=>{
 await db.query('select complete_assigned_daily_task(1,$1,$2)',['Done',paths]);
 expect((await db.query('select * from daily_task_photos')).rows).toHaveLength(20);
 expect((await db.query('select status from admin_daily_tasks')).rows).toEqual([{status:'completed'}]);
});
it('continues to reject an unrelated user',async()=>{
 await db.exec("set app.photo_actor='00000000-0000-4000-8000-000000000002'");
 await expect(db.query('select complete_assigned_daily_task(1,$1,$2)',['Done',paths])).rejects.toThrow('Assigned daily task not found');
});
