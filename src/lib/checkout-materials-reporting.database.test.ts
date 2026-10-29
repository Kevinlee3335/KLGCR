// @vitest-environment node
import {it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
it('checks checkout materials, duplicate painting assignments, readiness and report integration',async()=>{
const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create table profiles(id uuid primary key,full_name text,role text);
create function public.current_role() returns text language sql as $$select role from public.profiles where id=auth.uid()$$;
create function is_admin() returns boolean language sql as $$select public.current_role()='admin'$$;
create function is_management() returns boolean language sql as $$select public.current_role() in ('admin','management_viewer')$$;
create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
create table blocks(id uuid primary key,code text);
create table checkout_rooms(id uuid primary key,reference_no text,block_id uuid,room_no text,assigned_to uuid,cleaner_id uuid,status text,deleted_at timestamptz,created_at timestamptz default now(),ready_at timestamptz);
create table checkout_defects(checkout_room_id uuid,description text,status text,rectified_at timestamptz);
create table checkout_history(checkout_room_id uuid,actor_id uuid,action text,notes text,created_at timestamptz default now());
create table material_requests(id uuid primary key default gen_random_uuid(),job_id uuid not null,requested_by uuid,note text,status text default 'pending',created_at timestamptz default now(),issued_by uuid,issued_at timestamptz);
create table inventory_items(id uuid primary key,balance_qty numeric,is_active boolean);
create table material_request_items(id uuid primary key default gen_random_uuid(),request_id uuid,inventory_item_id uuid,other_item_name text,requested_qty numeric,approved_qty numeric,issued_qty numeric);
create table inventory_issue_history(request_id uuid,job_id uuid not null,inventory_item_id uuid,staff_id uuid,qty numeric,balance_before numeric,balance_after numeric,issued_by uuid,issued_at timestamptz default now());
create table report_snapshots(report_type text,report_date date,block_group text,payload jsonb,whatsapp_text text);`);
await db.exec(readFileSync('supabase/migrations/20261029022810_checkout_materials_and_reporting.sql','utf8'));
const admin='00000000-0000-4000-8000-000000000001',staff='00000000-0000-4000-8000-000000000002',room='00000000-0000-4000-8000-000000000010',block='00000000-0000-4000-8000-000000000020',item='00000000-0000-4000-8000-000000000030';
await db.exec(`insert into profiles values('${admin}','Admin','admin'),('${staff}','Worker','maintenance_staff');insert into blocks values('${block}','A');insert into checkout_rooms(id,reference_no,block_id,room_no,assigned_to,status) values('${room}','TEST','${block}','101','${staff}','rectification');insert into checkout_defects values('${room}','Moldy','open',null);insert into inventory_items values('${item}',10,true);set app.uid='${staff}';`);
const req=(await db.query<{id:string}>(`select create_checkout_material_request($1,'test',$2::jsonb) id`,[room,JSON.stringify([{inventory_item_id:item,qty:2}])])).rows[0].id;
await db.exec(`set app.uid='${admin}';update material_requests set status='approved';update material_request_items set approved_qty=2;`);
await db.query('select issue_material_request($1)',[req]);
if((await db.query<{balance_qty:string}>('select balance_qty from inventory_items')).rows[0].balance_qty!=='8')throw Error('Wrong balance');
try{await db.query('select issue_material_request($1)',[req]);throw Error('Repeated issue allowed')}catch(e){if(!(e instanceof Error && e.message.includes('Approved request not found')))throw e;}
await db.query(`insert into checkout_paint_tasks(checkout_room_id,area,reasons,worker_name,work_date,created_by) values($1,'room',array['Moldy'],'General Worker',current_date,$2)`,[room,admin]);
try{await db.query(`insert into checkout_paint_tasks(checkout_room_id,area,reasons,worker_name,work_date,created_by) values($1,'room',array['Dirty'],'Other Worker',current_date,$2)`,[room,admin]);throw Error('Duplicate room allowed')}catch(e){if(!(e instanceof Error && e.message.includes('checkout_paint_active_room_idx')))throw e;}
try{await db.exec("update checkout_rooms set status='ready_for_occupancy'");throw Error('Unfinished painting accepted')}catch(e){if(!(e instanceof Error && e.message.includes('Complete General Worker')))throw e;}
await db.exec("update checkout_paint_tasks set status='completed';update checkout_rooms set status='ready_for_occupancy',ready_at=now();");
const report=(await db.query<{report:{total:number;ready:number}}>("select checkout_status_report((now() at time zone 'Asia/Kuala_Lumpur')::date) report")).rows[0].report;
if(report.total!==1||report.ready!==1)throw Error('Wrong dashboard');
await db.exec("insert into report_snapshots values('daily_summary',current_date,'ALL','{}','test')");
if(!(await db.query<{payload:{checkout:unknown}}>('select payload from report_snapshots')).rows[0].payload.checkout)throw Error('Missing automatic summary');
}finally{await db.close()}
},20000);
