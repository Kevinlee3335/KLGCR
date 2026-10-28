// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("restricts admin follow-up, records outcomes atomically, and closes only the last completed defect", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function public.is_admin() returns boolean language sql as $$select current_setting('test.role',true)='admin'$$;
      create type public.job_status as enum ('assigned','in_progress','under_monitoring','completed','cancelled');
      create table complaints(id uuid primary key,status text,updated_at timestamptz);
      create table maintenance_jobs(id uuid primary key,complaint_id uuid,status job_status,completed_at timestamptz,action_taken text,monitoring_review_at timestamptz,updated_at timestamptz);
      create table job_status_history(job_id uuid,previous_status job_status,new_status job_status,note text,changed_by uuid,created_at timestamptz default now());
      set test.uid='00000000-0000-0000-0000-000000000001'; set test.role='admin';
      insert into complaints values('00000000-0000-0000-0000-000000000010','assigned',now());
      insert into maintenance_jobs(id,complaint_id,status) values
      ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000010','under_monitoring'),
      ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000010','under_monitoring');
    `);
    await db.exec(readFileSync("supabase/migrations/20261003124500_sync_complaint_completion_status.sql","utf8"));
    await db.exec(readFileSync("supabase/migrations/20261028090533_admin_monitoring_follow_up.sql","utf8"));
    const job = "00000000-0000-0000-0000-000000000011";
    const follow = (outcome: string, note = "Student contacted", date: string | null = null) => db.query("select admin_follow_up_monitoring_job($1,$2,$3,$4)",[job,outcome,note,date]);
    await db.exec("set test.role='management_viewer'");
    await expect(follow("completed")).rejects.toThrow("Administrator access required");
    await db.exec("set test.role='admin'");
    await expect(follow("completed", " ")).rejects.toThrow("remarks");
    await expect(follow("under_monitoring")).rejects.toThrow("future");
    await expect(follow("cancelled")).rejects.toThrow("Invalid");
    await follow("under_monitoring", "No answer", "2099-01-01T00:00:00+08:00");
    expect((await db.query<{note:string}>("select note from job_status_history")).rows[0].note).toContain("2099-01-01");
    await follow("in_progress", "Leak remains");
    await expect(follow("completed")).rejects.toThrow("no longer under monitoring");
    await db.exec(`update maintenance_jobs set status='under_monitoring' where id='${job}'`);
    await follow("completed", "Student confirmed fixed");
    expect((await db.query<{status:string}>("select status from complaints")).rows[0].status).toBe("assigned");
    await db.query("select admin_follow_up_monitoring_job($1,'completed','Student confirmed fixed',null)",["00000000-0000-0000-0000-000000000012"]);
    expect((await db.query<{status:string}>("select status from complaints")).rows[0].status).toBe("closed");
    expect((await db.query("select * from job_status_history")).rows).toHaveLength(4);
  } finally { await db.close(); }
}, 20000);
