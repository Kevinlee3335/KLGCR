// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
it('enforces Fikri then Kevin, and blocks James approval until both signed verifications exist',async()=>{
 const db=new PGlite();
 const fikri='a21286a7-56fd-48e4-9571-ffeacf825692',kevin='7a40e00f-2e95-4c27-83d9-0f7dba788b77',james='eeab5f04-30c3-42bd-a095-58e56c814358';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select current_setting('app.uid')::uuid$$;
 create function public.current_role() returns text language sql as $$select 'admin'::text$$;
 create function public.is_admin() returns boolean language sql as $$select true$$;
 create table profiles(id uuid primary key,full_name text,username text,role text default 'admin',is_active boolean default true,deleted_at timestamptz);
 create table user_e_signatures(user_id uuid primary key,signature jsonb);
 create table billing_preview_runs(id uuid primary key default gen_random_uuid(),snapshot jsonb not null);
 create table gym_monthly_approvals(id uuid primary key,approved_at timestamptz);
 insert into profiles(id,full_name,username) values('${fikri}','Fikri','fikri'),('${kevin}','Kevin','kevinlee3335'),('${james}','James','james');
 grant usage on schema public,auth to authenticated;
 grant select on profiles,user_e_signatures,billing_preview_runs to authenticated;
 insert into billing_preview_runs(snapshot) values('{"lines":[{"amount":10}]}');`);
 for(const name of ['20261028043048_billing_run_james_approval_signatures','20261102074000_sequential_document_verification'])await db.exec(readFileSync('supabase/migrations/'+name+'.sql','utf8'));
 const id=(await db.query<{id:string}>('select id from billing_preview_runs')).rows[0].id;
 await db.query('insert into user_e_signatures select id,$1::jsonb from profiles',[JSON.stringify({strokes:[[[0.1,0.2],[0.7,0.8]]]})]);
 await db.exec(`set role authenticated;set app.uid='${kevin}'`);
 await expect(db.query("select verify_document('billing',$1)",[id])).rejects.toThrow('Fikri, then Kevin');
 await db.exec(`set app.uid='${james}'`);
 await expect(db.query('select approve_billing_run($1)',[id])).rejects.toThrow('must verify');
 await db.exec(`set app.uid='${fikri}'`);
 expect((await db.query<{audit:unknown[]}>("select verify_document('billing',$1) audit",[id])).rows[0].audit).toHaveLength(1);
 // Retrying Fikri does not advance the stage twice.
 expect((await db.query<{audit:unknown[]}>("select verify_document('billing',$1) audit",[id])).rows[0].audit).toHaveLength(1);
 await db.exec(`set app.uid='${james}'`);
 await expect(db.query('select approve_billing_run($1)',[id])).rejects.toThrow('must verify');
 await db.exec(`set app.uid='${kevin}'`);
 expect((await db.query<{audit:unknown[]}>("select verify_document('billing',$1) audit",[id])).rows[0].audit).toHaveLength(2);
 await db.exec(`set app.uid='${james}'`);
 const result=(await db.query<{approval:{verifications:{user_id:string}[]}}>('select approve_billing_run($1) approval',[id])).rows[0].approval;
 expect(result.verifications.map(v=>v.user_id)).toEqual([fikri,kevin]);
 }finally{await db.close()}
});
