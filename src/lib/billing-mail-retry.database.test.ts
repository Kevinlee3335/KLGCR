// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

const oldPending='00000000-0000-4000-8000-000000000001';
const oldManual='00000000-0000-4000-8000-000000000002';
const newPending='00000000-0000-4000-8000-000000000003';
const newSending='00000000-0000-4000-8000-000000000004';

it('automatically claims only new approvals, caps retries and recovers stale sending',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon;
   create role authenticated;
   create role service_role bypassrls;
   create table public.billing_preview_runs(id uuid primary key);
   create table public.billing_run_approvals(run_id uuid primary key,approved_at timestamptz not null);
   create function public.current_role() returns text language sql as $$select 'admin'::text$$;
   create function public.is_admin() returns boolean language sql as $$select true$$;
   create schema auth;
   create function auth.uid() returns uuid language sql as $$select null::uuid$$;
   insert into public.billing_run_approvals values('${oldManual}',clock_timestamp());
  `);
  await db.exec(readFileSync('supabase/migrations/20261028074833_billing_approved_mail_dispatch.sql','utf8'));
  await db.query('insert into public.billing_run_approvals values($1,clock_timestamp())',[oldPending]);
  await db.exec(readFileSync('supabase/migrations/20261111050006_billing_approval_mail_retry.sql','utf8'));
  await db.query('insert into public.billing_mail_dispatch(run_id) values($1)',[oldManual]);
  await db.query('insert into public.billing_run_approvals values($1,clock_timestamp()),($2,clock_timestamp())',[newPending,newSending]);

  await db.exec(`
   update public.billing_mail_dispatch set next_automatic_retry_at=now()-interval '1 minute' where next_automatic_retry_at is not null;
   update public.billing_mail_dispatch set status='sending',attempted_at=now() where run_id='${newSending}';
   set role authenticated;
  `);
  await expect(db.query('select public.claim_due_billing_mail_retry()')).rejects.toThrow('permission denied');
  await db.exec('reset role; set role service_role');
  const claim=async()=> (await db.query<{id:string|null}>('select public.claim_due_billing_mail_retry() id')).rows[0].id;
  expect(await claim()).toBe(newPending);
  expect(await claim()).toBeNull();
  for(let attempt=0;attempt<2;attempt++){
   await db.query("update public.billing_mail_dispatch set status='uncertain',next_automatic_retry_at=now()-interval '1 minute' where run_id=$1",[newPending]);
   expect(await claim()).toBe(newPending);
  }
  await db.query("update public.billing_mail_dispatch set next_automatic_retry_at=now()-interval '1 minute' where run_id=$1",[newPending]);
  expect(await claim()).toBeNull();
  await db.query("update public.billing_mail_dispatch set attempted_at=now()-interval '3 minutes' where run_id=$1",[newSending]);
  expect(await claim()).toBe(newSending);
  expect(await claim()).toBeNull();
  const {rows}=await db.query<{run_id:string;automatic_retry_attempts:number;next_automatic_retry_at:string|null}>('select run_id,automatic_retry_attempts,next_automatic_retry_at from public.billing_mail_dispatch order by run_id');
  expect(rows[0]).toMatchObject({run_id:oldPending,automatic_retry_attempts:0,next_automatic_retry_at:null});
  expect(rows[1]).toMatchObject({run_id:oldManual,automatic_retry_attempts:0});
  expect(rows[2]).toMatchObject({run_id:newPending,automatic_retry_attempts:3});
 }finally{await db.close();}
});
