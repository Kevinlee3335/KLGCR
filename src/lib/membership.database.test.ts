// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, expect, it } from "vitest";
const db=new PGlite();
const admin='00000000-0000-4000-8000-000000000001';
const staff='00000000-0000-4000-8000-000000000002';
const member='10000000-0000-4000-8000-000000000001';
let month:string;
let payment:string;
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;
 create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table public.profiles(id uuid primary key,role text,is_active boolean,deleted_at timestamptz);`);
 await db.exec(readFileSync('supabase/migrations/20261016070407_membership_registration.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261017042521_membership_runtime_configuration.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261017042730_membership_public_requests.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261017044216_membership_declaration_consent.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261020034051_membership_personal_photos.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261020034143_membership_cash_access_card_deposit.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261020035652_membership_emergency_contact.sql','utf8'));
 await db.exec(readFileSync("supabase/migrations/20261021041410_membership_admin_status.sql","utf8"));
 await db.exec(readFileSync("supabase/migrations/20261022084319_membership_member_number.sql","utf8"));
 await db.query("insert into profiles values($1,'admin',true,null),($2,'maintenance_staff',true,null)",[admin,staff]);
 month=(await db.query<{m:string}>("select date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date::text m")).rows[0].m;
 const data={id:member,full_name:'Member',email:'test@example.com',member_type:'outsider',id_type:'IC',identification:'123',gender:'Male',nationality:'Malaysian',room_no:'A421',student_id:'123',address:'UTM',emergency_contact:'+60123456789',emergency_relationship:'Spouse',photo_path:member+'/portrait.jpg',token_hash:'hash',token_ciphertext:'encrypted',declaration_accepted:true,declaration_version:'2026-10-17-v1',declaration_clauses:['a','b','c','d']};
 await db.query('select register_membership($1,$2)',[JSON.stringify(data),'private/receipt.pdf']);
 payment=(await db.query<{id:string}>('select id from membership_payments')).rows[0].id;
},30000);
afterAll(()=>db.close());
it('keeps PII and tokens inaccessible to anon and authenticated',async()=>{
 for(const role of ['anon','authenticated']) {
 await db.exec(`set role ${role}`);
 await expect(db.query('select * from memberships')).rejects.toThrow('permission denied');
 await expect(db.query("select membership_rate_limit('x')")).rejects.toThrow('permission denied');
 await db.exec('reset role');
 }
 const rows=(await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where relname in ('memberships','membership_payments','membership_activity','membership_emails','membership_request_limits')")).rows;
 expect(rows).toHaveLength(5); expect(rows.every(r=>r.relrowsecurity)).toBe(true);
});
it('stores personal photo and queues RM40 online fee pending manual approval',async()=>{
 expect((await db.query<{amount:string}>('select amount from membership_payments')).rows[0].amount).toBe('40.00');
 expect((await db.query<{photo_path:string;status:string}>('select photo_path,status from memberships where id=$1',[member])).rows[0]).toEqual({photo_path:member+'/portrait.jpg',status:'pending'});
 expect((await db.query("select * from membership_activity where event='registration_submitted'")).rows).toHaveLength(1);
});
it('rejects non-admin approval and requires rejection reason',async()=>{
 await expect(db.query('select review_membership_payment($1,$2,true,null)',[payment,staff])).rejects.toThrow('Admin');
 await expect(db.query('select review_membership_payment($1,$2,false,null)',[payment,admin])).rejects.toThrow('reason');
});
it('atomically approves, extends validity and queues one confirmation',async()=>{
 await db.query('select review_membership_payment($1,$2,true,$3)',[payment,admin,'Bank checked']);
 const row=(await db.query<{status:string;expires_on:string}>("select status,expires_on::text from memberships where id=$1",[member])).rows[0];
 expect(row.status).toBe('active');
 expect(row.expires_on).toBe((await db.query<{e:string}>("select ($1::date+interval '1 month'-interval '1 day')::date::text e",[month])).rows[0].e);
 expect((await db.query('select * from membership_emails')).rows).toHaveLength(2);
 await expect(db.query('select review_membership_payment($1,$2,true,null)',[payment,admin])).rejects.toThrow('no longer pending');
 expect((await db.query('select * from membership_emails')).rows).toHaveLength(2);
});
it('enforces one non-rejected receipt per month',async()=>{
 await expect(db.query("insert into membership_payments(member_id,kind,period_start,amount,receipt_path) values($1,'renewal',$2,40,'x')",[member,month])).rejects.toThrow('duplicate');
});
it('cancels without deleting records and rejects pending renewals',async()=>{
 const next=(await db.query<{p:string}>("select ($1::date+interval '1 month')::date::text p",[month])).rows[0].p;
 await db.query("insert into membership_payments(member_id,kind,period_start,amount,receipt_path) values($1,'renewal',$2,40,'next')",[member,next]);
 await db.query("select cancel_membership('hash')");
 expect((await db.query<{status:string}>('select status from memberships')).rows[0].status).toBe('cancelled');
 expect((await db.query('select * from membership_payments')).rows).toHaveLength(2);
 expect((await db.query("select * from membership_payments where status='pending_verification'")).rows).toHaveLength(0);
 expect((await db.query("select * from membership_activity where event='member_cancelled'")).rows).toHaveLength(1);
 await db.query("select cancel_membership('hash')");
 await expect(db.query("select submit_membership_receipt('hash','another',$1)",[next])).rejects.toThrow("not available");
 expect((await db.query("select * from membership_activity where event='member_cancelled'")).rows).toHaveLength(1);
});
it('limits public submissions using persistent counters',async()=>{
 for(let i=0;i<20;i++) expect((await db.query<{membership_rate_limit:boolean}>("select membership_rate_limit('ip')")).rows[0].membership_rate_limit).toBe(true);
 expect((await db.query<{membership_rate_limit:boolean}>("select membership_rate_limit('ip')")).rows[0].membership_rate_limit).toBe(false);
});

it('keeps runtime secrets and public requests private',async()=>{
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await expect(db.query('select * from membership_runtime')).rejects.toThrow('permission denied');
  await expect(db.query('select * from membership_requests')).rejects.toThrow('permission denied');
  await db.exec('reset role');
 }
 expect((await db.query<{n:number}>('select length(token_secret) n from membership_runtime')).rows[0].n).toBe(64);
});
it('requires Admin review before a name/room cancellation can affect membership',async()=>{
 const mid='10000000-0000-4000-8000-000000000002';
 await db.query("insert into memberships(id,full_name,email,member_type,id_type,identification,gender,nationality,room_no,student_id,address,token_hash,token_ciphertext,status,expires_on) values($1,'Test','request@example.invalid','resident','IC','987','Male','MY','B111','123','B111','testhash','enc','active',($2::date+interval '1 month'-interval '1 day')::date)",[mid,month]);
 const req=(await db.query<{id:string}>("insert into membership_requests(full_name,room_no,request_type,member_id) values('Test','B111','cancel',$1) returning id",[mid])).rows[0].id;
 expect((await db.query<{status:string}>('select status from memberships where id=$1',[mid])).rows[0].status).toBe('active');
 await expect(db.query('select review_membership_request($1,$2,true,null)',[req,staff])).rejects.toThrow('Admin');
 await db.query("select review_membership_request($1,$2,true,'Verified with member')",[req,admin]);
 expect((await db.query<{status:string}>('select status from memberships where id=$1',[mid])).rows[0].status).toBe('cancelled');
 await expect(db.query('select review_membership_request($1,$2,true,null)',[req,admin])).rejects.toThrow('no longer pending');
});
it('never approves an unmatched public request',async()=>{
 const req=(await db.query<{id:string}>("insert into membership_requests(full_name,room_no,request_type) values('Unknown','C999','renew') returning id")).rows[0].id;
 await expect(db.query('select review_membership_request($1,$2,true,null)',[req,admin])).rejects.toThrow('resolved');
});

it('records the accepted declaration version and rejects registration without acceptance',async()=>{
 const declaration=(await db.query<{details:{version:string;clauses:string[]}}>("select details from membership_activity where member_id=$1 and event='rules_accepted'",[member])).rows[0];
 expect(declaration.details).toEqual({version:'2026-10-17-v1',clauses:['a','b','c','d']});
 await expect(db.query("select register_membership('{}'::jsonb,null)")).rejects.toThrow('declaration acceptance');
});

it('restricts manual status changes, preserves expiry, and audits each change atomically',async()=>{
 const mid='10000000-0000-4000-8000-000000000003';
 await db.query("insert into memberships(id,full_name,email,member_type,id_type,identification,gender,nationality,room_no,student_id,address,token_hash,token_ciphertext,status,expires_on) values($1,'Status Test','status@example.invalid','resident','IC','status','Male','MY','A1','1','A1','statushash','enc','active',current_date+30)",[mid]);
 const change=(actor:string,status:string,expected:string,note='Admin test')=>db.query('select set_membership_status($1,$2,$3,$4,$5)',[mid,actor,status,expected,note]);
 await expect(change(staff,'suspended','active')).rejects.toThrow('Admin');
 await expect(change(admin,'suspended','active','')).rejects.toThrow('reason');
 await change(admin,'suspended','active');
 await expect(change(admin,'cancelled','active')).rejects.toThrow('Status changed');
 const row=(await db.query<{status:string;days:number}>("select status,expires_on-current_date days from memberships where id=$1",[mid])).rows[0];
 expect(row).toEqual({status:'suspended',days:30});
 const pid=(await db.query<{id:string}>("insert into membership_payments(member_id,kind,period_start,amount,receipt_path) values($1,'renewal',($2::date+interval '2 months')::date,40,'test') returning id",[mid,month])).rows[0].id;
 await expect(db.query('select review_membership_payment($1,$2,true,null)',[pid,admin])).rejects.toThrow('cancelled');
 await change(admin,'active','suspended');
 await change(admin,'cancelled','active');
 expect((await db.query<{status:string}>('select status from membership_payments where id=$1',[pid])).rows[0].status).toBe('rejected');
 expect((await db.query("select * from membership_activity where member_id=$1 and event='status_changed' and actor_id=$2",[mid,admin])).rows).toHaveLength(3);
 await db.query("update memberships set expires_on=current_date-1 where id=$1",[mid]);
 await expect(change(admin,'active','cancelled')).rejects.toThrow('renewal');
 await db.query("update memberships set status='pending' where id=$1",[mid]);
 await expect(change(admin,'active','pending')).rejects.toThrow('initial payment');
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await expect(change(admin,'cancelled','pending')).rejects.toThrow('permission denied');
  await db.exec('reset role');
 }
});

it('assigns Non Residence member numbers atomically and rejects blanks, duplicates and unauthorized approval',async()=>{
 const make=async(suffix:string)=>{
  const mid=`20000000-0000-4000-8000-00000000000${suffix}`;
  await db.query("insert into memberships(id,full_name,email,member_type,id_type,identification,gender,nationality,room_no,student_id,address,token_hash,token_ciphertext) values($1,'Number Test',$2,'outsider','IC',$2,'Male','MY','Address','1','Address',$2,'enc')",[mid,`number${suffix}@example.invalid`]);
  const pid=(await db.query<{id:string}>("insert into membership_payments(member_id,kind,period_start,amount) values($1,'registration',$2,40) returning id",[mid,month])).rows[0].id;
  return {mid,pid};
 };
 const a=await make('1'),b=await make('2');
 const approve=(pid:string,num:string,actor=admin)=>db.query('select review_membership_payment_with_number($1,$2,true,null,$3)',[pid,actor,num]);
 await expect(approve(a.pid,'')).rejects.toThrow('Member number');
 await expect(approve(a.pid,'GYM001',staff)).rejects.toThrow('Admin');
 await approve(a.pid,'  GYM001  ');
 expect((await db.query('select member_number,status from memberships where id=$1',[a.mid])).rows[0]).toEqual({member_number:'GYM001',status:'active'});
 await expect(approve(b.pid,'gym001')).rejects.toThrow('unique');
 expect((await db.query('select status from membership_payments where id=$1',[b.pid])).rows[0]).toEqual({status:'pending_verification'});
 expect((await db.query("select * from membership_emails where member_id=$1 and kind='approved'",[b.mid])).rows).toHaveLength(0);
 await approve(b.pid,'GYM002');
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await expect(approve(a.pid,'GYM003')).rejects.toThrow('permission denied');
  await db.exec('reset role');
 }
});
