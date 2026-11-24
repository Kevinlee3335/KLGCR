// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('defers repairs atomically with a date, preserves ownership, and requires due-date checkout confirmation', async () => {
 const db = new PGlite();
 const actor='00000000-0000-0000-0000-000000000001', other='00000000-0000-0000-0000-000000000002';
 const job='00000000-0000-0000-0000-000000000011';
 try {
  await db.exec(`create role authenticated; create role anon; create schema auth;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function public.is_super_admin() returns boolean language sql as $$select current_setting('test.role',true)='super_admin'$$;
   create function public.current_role() returns text language sql as $$select current_setting('test.role',true)$$;
   create type public.job_status as enum ('assigned','in_progress','pending_material','under_monitoring','completed','cancelled');
   create table public.complaints(id uuid primary key,status text,updated_at timestamptz);
   create table public.maintenance_jobs(id uuid primary key,job_no text,complaint_id uuid,status job_status,assigned_to uuid,block_id smallint,scheduled_for date,started_at timestamptz,completed_at timestamptz,monitoring_review_at timestamptz);
   create table public.profile_blocks(profile_id uuid,block_id smallint);
   create table public.job_status_history(job_id uuid,previous_status job_status,new_status job_status,note text,changed_by uuid);
   create table public.super_admin_audit(actor_id uuid,operation text,entity_type text,entity_id uuid,previous_data jsonb,new_data jsonb,reason text);
   set test.uid='${actor}'; set test.role='super_admin';
   insert into complaints values('${job}','assigned',now());
   insert into maintenance_jobs(id,job_no,complaint_id,status,assigned_to,block_id) values('${job}','JOB-1','${job}','in_progress','${actor}',1);
   insert into profile_blocks values('${actor}',1),('${other}',1);`);
  await db.exec(readFileSync('supabase/migrations/20261124083520_waiting_checkout_job_status.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261124083746_maintenance_checkout_deferral.sql','utf8'));
  const defer=(date:string|null)=>db.query('select super_admin_wait_for_checkout($1,$2,$3)',[job,date,'Tenant still occupies the room']);
  await expect(defer(null)).rejects.toThrow('check-out date');
  await db.exec("set test.role='admin'"); await expect(defer('2099-01-01')).rejects.toThrow('Super Admin');
  await db.exec("set test.role='super_admin'"); await defer('2099-01-01');
  const row=(await db.query<{status:string;assigned_to:string;checkout_date:string;completed_at:null}>("select status,assigned_to,checkout_date::text,completed_at from maintenance_jobs")).rows[0];
  expect(row).toMatchObject({status:'waiting_checkout',assigned_to:actor,checkout_date:'2099-01-01',completed_at:null});
  expect((await db.query<{status:string}>('select status from complaints')).rows[0].status).toBe('assigned');
  expect((await db.query<{note:string}>('select note from job_status_history')).rows[0].note).toContain('01 Jan 2099');
  expect((await db.query('select * from super_admin_audit')).rows).toHaveLength(1);
  expect((await db.query<{outstanding:number}>('select outstanding from admin_dashboard_counts()')).rows[0].outstanding).toBe(1);
  await db.exec("set test.role='maintenance_staff'");
  await expect(db.query('select start_assigned_job($1,true)',[job])).rejects.toThrow('scheduled check-out date');
  // Editing the date records a second waiting-to-waiting event, not a duplicate-status error.
  await db.exec("set test.role='super_admin'"); await defer('2000-01-01');
  await db.exec("set test.role='maintenance_staff'");
  await expect(db.query('select start_assigned_job($1)',[job])).rejects.toThrow('Confirm the tenant');
  await db.exec(`set test.uid='${other}'`);
  await expect(db.query('select start_assigned_job($1,true)',[job])).rejects.toThrow('Assigned job not found');
  await db.exec(`set test.uid='${actor}'`);
  await db.query('select start_assigned_job($1,true)',[job]);
  expect((await db.query<{status:string}>('select status from maintenance_jobs')).rows[0].status).toBe('in_progress');
  expect((await db.query<{note:string}>('select note from job_status_history where new_status=\'in_progress\'')).rows[0].note).toContain('Tenant check-out confirmed');
  await expect(db.exec("update maintenance_jobs set status='waiting_checkout',checkout_date=null")).rejects.toThrow('maintenance_job_checkout_date_required');
  // Existing assigned-job calls still work without a check-out confirmation.
  await db.exec("update maintenance_jobs set status='assigned'");
  await db.query('select start_assigned_job($1)',[job]);
  expect((await db.query<{status:string}>('select status from maintenance_jobs')).rows[0].status).toBe('in_progress');
  // A postponed completed job must reopen its complaint.
  await db.exec("set test.role='super_admin';update maintenance_jobs set status='completed';update complaints set status='closed';");
  await defer('2099-02-01');
  expect((await db.query<{status:string}>('select status from complaints')).rows[0].status).toBe('assigned');
 } finally { await db.close(); }
}, 20000);
