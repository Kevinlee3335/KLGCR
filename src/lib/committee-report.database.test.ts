// @vitest-environment node
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {beforeAll,afterAll,it,expect} from "vitest";
const db=new PGlite();
const actor='00000000-0000-4000-8000-000000000001';
let month:string;
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table public.profiles(id uuid primary key,role text,is_active boolean,deleted_at timestamptz);
 create table public.memberships(id uuid primary key,full_name text);
 create table public.membership_payments(id uuid primary key,member_id uuid,kind text,amount numeric,status text,reviewed_at timestamptz,period_start date);
 insert into public.profiles values('${actor}','admin',true,null);
 insert into public.memberships values('${actor}','Original Name');`);
 await db.exec(readFileSync('supabase/migrations/20261022091513_membership_committee_reports.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261022092557_committee_zero_collection_months.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261023041910_committee_excel_sources_and_first_day_close.sql','utf8'));
 await db.exec("create table public.membership_payment_ledger(id uuid primary key,payment_id uuid,source text,collected_on date,full_name text);");
 await db.exec(readFileSync('supabase/migrations/20261023044541_membership_payment_list_delete.sql','utf8'));
 month=(await db.query<{m:string}>("select (date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')-interval '1 month')::date::text m")).rows[0].m;
},30000);
afterAll(()=>db.close());
it('uses MYT approval dates, both registration and renewal, and saves immutable snapshots',async()=>{
 const rows=[['1','registration','approved',"$1::timestamp at time zone 'Asia/Kuala_Lumpur'"],['2','renewal','approved',"($1::timestamp+interval '1 month'-interval '1 second') at time zone 'Asia/Kuala_Lumpur'"],['3','registration','pending_verification',"$1::timestamp at time zone 'Asia/Kuala_Lumpur'"],['4','renewal','rejected',"$1::timestamp at time zone 'Asia/Kuala_Lumpur'"],['5','registration','approved',"($1::timestamp-interval '1 second') at time zone 'Asia/Kuala_Lumpur'"],['6','renewal','approved',"($1::timestamp+interval '1 month') at time zone 'Asia/Kuala_Lumpur'"]];
 for(const [id,kind,status,date] of rows) await db.query(`insert into membership_payments values('10000000-0000-4000-8000-00000000000${id}','${actor}','${kind}',40,'${status}',${date},$1::date)`,[month]);
 await db.query('select save_membership_committee_report($1,$2)',[month,actor]);
 const r=(await db.query<{total_amount:string;remuneration:string;payment_count:number;member_count:number;entries:{full_name:string;amount:number;payments:unknown[]}[]}>('select * from membership_committee_reports where month=$1',[month])).rows[0];
 expect(Number(r.total_amount)).toBe(80);expect(Number(r.remuneration)).toBe(500);expect(r.payment_count).toBe(2);expect(r.member_count).toBe(1);expect(r.entries[0].payments).toHaveLength(2);
 await db.exec("update memberships set full_name='Changed';update membership_payments set amount=9000");
 await db.query('select save_membership_committee_report($1,$2)',[month,actor]);
 const saved=(await db.query<{entries:{full_name:string}[];total_amount:string}>('select * from membership_committee_reports where month=$1',[month])).rows[0];
 expect(saved.entries[0].full_name).toBe('Original Name');expect(Number(saved.total_amount)).toBe(80);
});
it('restricts reports and generation to server roles and rejects open months',async()=>{
 await expect(db.query("select save_membership_committee_report(date_trunc('month',now())::date,$1)",[actor])).rejects.toThrow('completed');
 await expect(db.query('select save_membership_committee_report($1,$2)',[month,'00000000-0000-4000-8000-000000000002'])).rejects.toThrow('Admin');
 for(const role of ['anon','authenticated']){
 await db.exec(`set role ${role}`);
 await expect(db.query('select * from membership_committee_reports')).rejects.toThrow('permission denied');
 await expect(db.query('select save_membership_committee_report($1,null)',[month])).rejects.toThrow('permission denied');
 await expect(db.query('select generate_due_membership_committee_reports()')).rejects.toThrow('permission denied');
 await db.exec('reset role');
 }
});
it('daily scheduling catches up due months and never overwrites or duplicates them',async()=>{
 await db.query('select generate_due_membership_committee_reports()');
 const a=(await db.query('select month from membership_committee_reports')).rows;
 await db.query('select generate_due_membership_committee_reports()');
 expect((await db.query('select month from membership_committee_reports')).rows).toEqual(a);
 expect(a.length).toBeGreaterThan(0);
});

it('calculates the RM1,000 boundary and RM3,000 cap in the database',async()=>{
 for(const [offset,amount,payable] of [[3,999.99,500],[4,1000,400],[5,7500,3000],[6,8000,3000]]){
 const period=(await db.query<{m:string}>("select (date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')-($1::text||' months')::interval)::date::text m",[offset])).rows[0].m;
 await db.query("insert into membership_payments values(gen_random_uuid(),$1,'registration',$2,'approved',$3::timestamp at time zone 'Asia/Kuala_Lumpur',$3::date)",[actor,amount,period]);
 await db.query('select save_membership_committee_report($1,$2)',[period,actor]);
 const row=(await db.query<{remuneration:string}>('select remuneration from membership_committee_reports where month=$1',[period])).rows[0];
 expect(Number(row.remuneration)).toBe(payable);
 }
});

it('merges imported rows with new approvals while keeping the open month unprinted',async()=>{
 const m=(await db.query<{m:string}>("select date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date::text m")).rows[0].m;
 await db.query("insert into membership_committee_sources(month,entries,source_file,source_sha256) values($1,$2,'October.xlsx','sha')",[m,JSON.stringify([{member_id:'legacy:1',full_name:'Imported Member',amount:40,payments:[]}])]);
 const initial=(await db.query<{r:{total_amount:number}}>('select preview_membership_committee_report($1) r',[m])).rows[0].r;
 await db.query("insert into membership_payments values(gen_random_uuid(),$1,'renewal',40,'approved',($2::timestamp+interval '2 days') at time zone 'Asia/Kuala_Lumpur',$2::date)",[actor,m]);
 const next=(await db.query<{r:{total_amount:number;entries:{full_name:string}[]}}>('select preview_membership_committee_report($1) r',[m])).rows[0].r;
 expect(next.total_amount).toBe(initial.total_amount+40);
 expect(next.entries.some(e=>e.full_name==='Imported Member')).toBe(true);
 await expect(db.query('select save_membership_committee_report($1,null)',[m])).rejects.toThrow('completed');
 expect((await db.query('select * from membership_committee_reports where month=$1',[m])).rows).toHaveLength(0);
});

it('only admins can delete a list entry and deleted payments leave live reports but preserve saved reports',async()=>{
 const m=(await db.query<{m:string}>("select date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date::text m")).rows[0].m;
 const payment='00000000-0000-4000-8000-000000000090',ledger='00000000-0000-4000-8000-000000000091';
 await db.query("insert into membership_payments values($1,$2,'renewal',40,'approved',($3::timestamp+interval '3 days') at time zone 'Asia/Kuala_Lumpur',$3::date)",[payment,actor,m]);
 await db.query("insert into membership_payment_ledger(id,payment_id,source,collected_on,full_name) values($1,$2,'system',$3,'Test')",[ledger,payment,m]);
 const before=(await db.query<{r:{total_amount:number}}>('select preview_membership_committee_report($1) r',[m])).rows[0].r;
 await expect(db.query('select delete_membership_payment_list_entry($1,$2)',[ledger,null])).rejects.toThrow('Admin');
 await db.query('select delete_membership_payment_list_entry($1,$2)',[ledger,actor]);
 await db.query('select delete_membership_payment_list_entry($1,$2)',[ledger,actor]);
 const after=(await db.query<{r:{total_amount:number}}>('select preview_membership_committee_report($1) r',[m])).rows[0].r;
 expect(after.total_amount).toBe(before.total_amount-40);
 expect((await db.query('select * from membership_payment_ledger where deleted_at is null and id=$1',[ledger])).rows).toHaveLength(0);
 expect((await db.query('select * from membership_payments where id=$1',[payment])).rows).toHaveLength(1);
 expect((await db.query<{deleted_by:string}>('select deleted_by from membership_payment_ledger where id=$1',[ledger])).rows[0].deleted_by).toBe(actor);
 await db.exec('set role anon');
 await expect(db.query('select delete_membership_payment_list_entry($1,$2)',[ledger,actor])).rejects.toThrow('permission denied');
 await db.exec('reset role');
});
