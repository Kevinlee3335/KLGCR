// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('shares one counter, preserves duplicate submissions and prevents overpayment and cross-account allocation',async()=>{
 const db=new PGlite();const actor='00000000-0000-4000-8000-000000000001',run='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003';
 try{await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table profiles(id uuid primary key,role text,is_active boolean,deleted_at timestamptz);create table billing_preview_runs(id uuid primary key,kind text,period text,snapshot jsonb);create table billing_run_approvals(run_id uuid);create table memberships(id uuid primary key,full_name text,email text);create table membership_payments(id uuid primary key,member_id uuid,status text,kind text,reviewed_at timestamptz,reviewed_by uuid,period_start date,amount numeric,receipt_path text);create table membership_payment_ledger(payment_id uuid,receipt_no text,receipt_updated_at timestamptz);insert into profiles values('${actor}','admin',true,null);insert into billing_preview_runs values('${run}','rental','2026-10','{"lines":[{"accountId":"1","name":"Test Company","billNo":"INV 2610/C/001","amount":100}]}');insert into billing_run_approvals values('${run}');`);
 await db.exec(readFileSync('supabase/migrations/20261029081238_unified_receipts_and_billing_payments.sql','utf8'));
 const args=[id,actor,'rental','1','2026-10-01','test@example.com',`payments/${id}/proof.jpg`,'bank-ref',JSON.stringify([{run_id:run,line_index:0,amount:60}])];
 const sql='select to_jsonb(record_billing_payment($1,$2,$3,$4,$5,$6,$7,$8,$9)) r';
 const first=(await db.query<{r:{receipt_no:string}}>(sql,args)).rows[0].r;
 expect(first.receipt_no).toMatch(/^KLGCR\/\d{2}0001$/);expect((await db.query(sql,args)).rows[0]).toEqual({r:first});
 await expect(db.query(sql,['00000000-0000-4000-8000-000000000004',...args.slice(1,6),'payments/00000000-0000-4000-8000-000000000004/proof.jpg','',JSON.stringify([{run_id:run,line_index:0,amount:41}])])).rejects.toThrow('exceeds');
 await expect(db.query(sql,['00000000-0000-4000-8000-000000000005',actor,'rental','wrong','2026-10-01','test@example.com','payments/00000000-0000-4000-8000-000000000005/proof.jpg','',args[8]])).rejects.toThrow('Invalid invoice');
 const gym=(await db.query<{r:{receipt_no:string}}>("select to_jsonb(issue_official_receipt('gym:test','gym','2026-10-01','Test Student','s@example.com',40,'Gym renewal',null,'',$1)) r",[actor])).rows[0].r;expect(gym.receipt_no.slice(-4)).toBe('0002');
 await db.exec(`insert into memberships values('${actor}','Student','student@example.com');insert into membership_payments values('${id}','${actor}','pending_verification','renewal',null,null,'2026-10-01',40,'proof.jpg');insert into membership_payment_ledger values('${id}','',null);update membership_payments set status='approved',reviewed_at=now(),reviewed_by='${actor}' where id='${id}';`);
 expect((await db.query<{receipt_no:string}>('select receipt_no from membership_payment_ledger')).rows[0].receipt_no.slice(-4)).toBe('0003');
 await db.exec(`update membership_payments set status='approved' where id='${id}';`);
 expect((await db.query<{n:number}>('select count(*)::int n from official_receipts')).rows[0].n).toBe(3);
 await expect(db.exec(`update membership_payment_ledger set receipt_no='changed'`)).rejects.toThrow('cannot be changed');
 await db.exec('set role authenticated');await expect(db.query('select * from official_receipts')).rejects.toThrow('permission denied');
 }finally{await db.close();}
});
