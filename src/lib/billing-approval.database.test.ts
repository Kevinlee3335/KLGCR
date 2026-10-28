// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
const james='eeab5f04-30c3-42bd-a095-58e56c814358',other='00000000-0000-4000-8000-000000000001';
it('only James can approve an immutable pack, copies his saved signature and preserves first approval',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select current_setting('app.uid')::uuid$$;
 create function public.current_role() returns text language sql as $$select 'admin'::text$$;
 create function public.is_admin() returns boolean language sql as $$select true$$;
 create table profiles(id uuid primary key,full_name text,is_active boolean default true,deleted_at timestamptz);
 create table user_e_signatures(user_id uuid primary key,signature jsonb);
 create table billing_preview_runs(id uuid primary key default gen_random_uuid(),snapshot jsonb not null);
 insert into profiles(id,full_name) values('${james}','James'),('${other}','Kevin');
 grant usage on schema public,auth to authenticated;
 grant select on profiles,user_e_signatures,billing_preview_runs to authenticated;
 insert into billing_preview_runs(snapshot) values('{"lines":[{"amount":10}]}');`);
 await db.exec(readFileSync('supabase/migrations/20261028043048_billing_run_james_approval_signatures.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261028074833_billing_approved_mail_dispatch.sql','utf8'));
 const id=(await db.query<{id:string}>('select id from billing_preview_runs')).rows[0].id;
 await db.exec(`set role authenticated;set app.uid='${other}';`);
 await expect(db.query('select approve_billing_run($1)',[id])).rejects.toThrow('Only James');
 await expect(db.query('insert into billing_run_approvals(run_id) values($1)',[id])).rejects.toThrow('Only James');
 await db.exec(`set app.uid='${james}'`);
 await expect(db.query('select approve_billing_run($1)',[id])).rejects.toThrow('signature');
 await db.exec('reset role');const sig={strokes:[[[0.1,0.2],[0.7,0.8]]]};
 await db.query('insert into user_e_signatures values($1,$2)',[james,JSON.stringify(sig)]);
 await db.exec('set role authenticated');
 const approved=(await db.query<{a:{signature:unknown;approved_at:string;approved_by_user:string}}>('select approve_billing_run($1) a',[id])).rows[0].a;
 const mail=(await db.query<{status:string;sender:string;recipient:string;cc:string[]}>('select * from billing_mail_dispatch')).rows;expect(mail).toHaveLength(1);expect(mail[0]).toMatchObject({status:'pending',sender:'klgcr.noreply@gmail.com',recipient:'account1@keanlenggroup.com',cc:['klgcr.kevin@gmail.com','klgcr.fikri@gmail.com']});await expect(db.query("update billing_mail_dispatch set status='sent'")).rejects.toThrow('permission denied');
 expect(approved.signature).toEqual(sig);expect(approved.approved_by_user).toBe(james);expect(approved.approved_at).toBeTruthy();
 await expect(db.query('update billing_run_approvals set approved_at=now()')).rejects.toThrow('permission denied');
 await expect(db.query('update billing_preview_runs set snapshot=$1',[JSON.stringify({lines:[]})])).rejects.toThrow('permission denied');
 await db.exec('reset role');await db.query('update user_e_signatures set signature=$1',[JSON.stringify({strokes:[[[0,0],[1,1]]]})]);
 await db.exec('set role authenticated');
 expect((await db.query<{a:unknown}>('select approve_billing_run($1) a',[id])).rows[0].a).toEqual(approved);
 }finally{await db.close()}
});
