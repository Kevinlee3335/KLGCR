// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('indexes each saved bill without copying snapshots, reflects approval and enforces financial archive roles',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create function public.current_role() returns text language sql as $$select current_setting('app.role',true)$$;
 create table billing_preview_runs(id uuid primary key,kind text,period text,issue_date date,created_at timestamptz default now(),snapshot jsonb);
 create table billing_run_approvals(run_id uuid,approved_by_user uuid,approved_at timestamptz,approved_by text,signature jsonb);
 create table billing_preview_settings(id integer,config jsonb);
 grant select on billing_preview_runs,billing_run_approvals,billing_preview_settings to authenticated;
 insert into billing_preview_settings values(1,'{"tenants":[{"id":1,"name":"Tenant A","lot":"Lot A"},{"id":2,"name":"Tenant A","lot":"Lot B"}],"utilityAccounts":[{"id":"u1","name":"Tenant A","meters":[{"photo":"private-photo"}]}]}');
 insert into billing_preview_runs(id,kind,period,issue_date,snapshot) values('11111111-1111-4111-8111-111111111111','rental','2026-10','2026-10-01','{"lines":[{"accountId":"1","name":"Tenant A","billNo":"INV-1","amount":100},{"accountId":"2","name":"Tenant A","billNo":"INV-2","amount":200}]}');
 `);
 await db.exec(readFileSync('supabase/migrations/20261028091030_billing_document_tenant_folders.sql','utf8'));
 await db.exec("set role authenticated;set app.role='admin'");
 const docs=(await db.query<{account_key:string;line_index:number;approved_at:string|null}>('select * from billing_document_index order by line_index')).rows;
 expect(docs.map(d=>[d.account_key,d.line_index])).toEqual([['1',0],['2',1]]);expect(docs[0].approved_at).toBeNull();
 expect((await db.query('select * from billing_account_directory')).rows).toHaveLength(3);
 await expect(db.query("delete from billing_document_index")).rejects.toThrow(/permission denied|cannot delete from view/);expect((await db.query<{allowed:boolean}>("select has_table_privilege('authenticated','public.billing_document_index','delete') allowed")).rows[0].allowed).toBe(false);
 await db.exec("reset role;insert into billing_run_approvals values('11111111-1111-4111-8111-111111111111','eeab5f04-30c3-42bd-a095-58e56c814358',now(),'James','{}');set role authenticated;set app.role='management_viewer'");
 expect((await db.query<{approved_by:string}>('select approved_by from billing_document_index')).rows[0].approved_by).toBe('James');
 await db.exec("set app.role='maintenance_staff'");expect((await db.query('select * from billing_document_index')).rows).toHaveLength(0);expect((await db.query('select * from billing_account_directory')).rows).toHaveLength(0);
 await db.exec('reset role');const metadata=(await db.query<{column_name:string}>("select column_name from information_schema.columns where table_name in ('billing_document_index','billing_account_directory')")).rows.map(r=>r.column_name);expect(metadata).not.toContain('snapshot');expect(metadata).not.toContain('signature');expect(metadata).not.toContain('photo');
 }finally{await db.close()}
});
