// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('holds and resumes unassigned complaints with authorization, atomic audit and stable intake totals', async () => {
  const db = new PGlite();
  const actor='00000000-0000-0000-0000-000000000001';
  const complaint='00000000-0000-0000-0000-000000000011';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function public.is_super_admin() returns boolean language sql as $$select current_setting('test.role',true)='super_admin'$$;
      create function public.is_admin() returns boolean language sql as $$select current_setting('test.role',true) in ('admin','super_admin')$$;
      create type complaint_status as enum ('new','under_review','assigned','rejected','closed');
      create table complaints(id uuid primary key,complaint_no text,status complaint_status,reviewed_by uuid,reviewed_at timestamptz,updated_at timestamptz,assigned_at timestamptz,submitted_at timestamptz,block_id int);
      create table maintenance_jobs(id uuid,complaint_id uuid,status text,assigned_at timestamptz);
      create table blocks(id int,code text); insert into blocks values(1,'A');
      create table complaint_activity(complaint_id uuid,action text,note text check(length(note)<=1000),actor_id uuid);
      create table super_admin_audit(actor_id uuid,operation text,entity_type text,entity_id uuid,previous_data jsonb,new_data jsonb,reason text);
      set test.uid='${actor}'; set test.role='admin';
      insert into complaints(id,complaint_no,status,submitted_at,block_id) values('${complaint}','CMP-1','new','2026-11-24 10:00+08',1);`);
    await db.exec(readFileSync('supabase/migrations/20261124091953_complaint_kiv_status.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20261124092004_super_admin_complaint_kiv.sql','utf8'));
    const update=(status:string,reason='Waiting for management decision')=>db.query('select super_admin_update_complaint($1,$2,$3)',[complaint,status,reason]);
    await expect(update('kiv')).rejects.toThrow('Super Admin');
    await db.exec("set test.role='super_admin'; set test.uid=''");
    await expect(update('kiv')).rejects.toThrow('Super Admin');
    await db.exec(`set test.uid='${actor}'`);
    await expect(update('kiv',' ')).rejects.toThrow('Reason');
    await expect(update('closed')).rejects.toThrow('Invalid complaint status');
    await update('kiv');
    const row=async()=>(await db.query<{status:string;assigned_at:null}>('select status,assigned_at from complaints')).rows[0];
    expect(await row()).toMatchObject({status:'kiv',assigned_at:null});
    expect((await db.query('select * from maintenance_jobs')).rows).toHaveLength(0);
    expect((await db.query<{s:Record<string,number>}>("select complaint_intake_summary('2026-11-24','ALL') s")).rows[0].s).toMatchObject({total:1,kiv:1,unassigned:0,completed:0,dispatched:0});
    await update('kiv','x'.repeat(1000));
    expect((await db.query<{action:string}>('select action from complaint_activity')).rows).toContainEqual({action:'KIV Note Added'});
    await update('new');
    expect((await row()).status).toBe('new');
    await update('kiv');
    await db.exec("set test.role='admin'");
    await db.query('select mark_complaint_under_review($1,$2)',[complaint,'Ready to review']);
    expect((await row()).status).toBe('under_review');
    await db.exec("set test.role='super_admin'");
    expect((await db.query('select * from super_admin_audit')).rows).toHaveLength(4);
    await db.query("insert into maintenance_jobs values($1,$1,'in_progress',now())",[complaint]);
    await expect(update('kiv')).rejects.toThrow('linked jobs');
    expect((await row()).status).toBe('under_review');
    expect((await db.query('select * from super_admin_audit')).rows).toHaveLength(4);
    await db.exec('set role anon');
    await expect(update('kiv')).rejects.toThrow('permission denied');
  } finally { await db.close(); }
},20000);
