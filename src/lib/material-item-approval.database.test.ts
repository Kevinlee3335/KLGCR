// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
const ids=Array.from({length:8},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
it.each(['job_id','checkout_room_id'])('approves and issues individual materials across batches for %s',async source=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create function is_admin() returns boolean language sql as $$select current_setting('app.uid',true)='${ids[0]}'$$;
 create table profiles(id uuid primary key);insert into profiles values('${ids[0]}');
 create type material_request_status as enum('pending','approved','rejected','issued');
 create table material_requests(id uuid primary key,job_id uuid,checkout_room_id uuid,requested_by uuid,status material_request_status default 'pending',reviewed_by uuid,reviewed_at timestamptz,rejection_reason text,issued_by uuid,issued_at timestamptz);
 create table inventory_items(id uuid primary key,balance_qty numeric,is_active boolean default true);
 create table material_request_items(id uuid primary key,request_id uuid,inventory_item_id uuid,requested_qty numeric,approved_qty numeric,issued_qty numeric);
 create table inventory_issue_history(request_id uuid,job_id uuid,checkout_room_id uuid,inventory_item_id uuid,staff_id uuid,qty numeric,balance_before numeric,balance_after numeric,issued_by uuid);
 set app.uid='${ids[0]}';`);
 await db.exec(readFileSync('supabase/migrations/20261029041959_material_request_item_approval.sql','utf8'));
 await db.exec(`insert into material_requests(id,${source},requested_by) values('${ids[1]}','${ids[7]}','${ids[0]}');insert into inventory_items(id,balance_qty) values('${ids[2]}',10),('${ids[3]}',10),('${ids[4]}',0);
 insert into material_request_items(id,request_id,inventory_item_id,requested_qty) values('${ids[2]}','${ids[1]}','${ids[2]}',2),('${ids[3]}','${ids[1]}','${ids[3]}',3),('${ids[4]}','${ids[1]}','${ids[4]}',1);`);
 const approve=(id:string)=>db.query('select approve_material_request_item($1,$2)',[ids[1],id]);
 const issue=(id:string|null=null)=>db.query('select issue_material_request_items($1,$2)',[ids[1],id]);
 await approve(ids[2]);await approve(ids[3]);await expect(approve(ids[4])).rejects.toThrow('Insufficient stock');
 expect((await db.query<{status:string}>('select status from material_requests')).rows[0].status).toBe('pending');
 expect((await db.query<{balance_qty:string}>('select balance_qty from inventory_items where id=$1',[ids[2]])).rows[0].balance_qty).toBe('10');
 await expect(db.query('select review_material_request($1,false,$2)',[ids[1],'No stock'])).rejects.toThrow('approved or issued');
 await issue(ids[2]);await expect(issue(ids[2])).rejects.toThrow('No approved');await issue();
 expect((await db.query<{n:number}>('select count(*)::int n from inventory_issue_history')).rows[0].n).toBe(2);
 expect((await db.query<{status:string}>('select status from material_requests')).rows[0].status).toBe('pending');
 expect((await db.query<{approved_qty:string|null}>('select approved_qty from material_request_items where id=$1',[ids[4]])).rows[0].approved_qty).toBeNull();
 await db.exec(`update inventory_items set balance_qty=5 where id='${ids[4]}'`);await approve(ids[4]);await db.query('select issue_material_request($1)',[ids[1]]);
 expect((await db.query<{status:string}>('select status from material_requests')).rows[0].status).toBe('issued');
 expect((await db.query<{balance_qty:string}>('select balance_qty from inventory_items where id=$1',[ids[2]])).rows[0].balance_qty).toBe('8');
 expect((await db.query<{balance_qty:string}>('select balance_qty from inventory_items where id=$1',[ids[4]])).rows[0].balance_qty).toBe('4');
 expect((await db.query<{n:number}>('select count(*)::int n from inventory_issue_history')).rows[0].n).toBe(3);
 await expect(issue()).rejects.toThrow('Approved request not found');
 await db.exec(`set app.uid='${ids[7]}'`);await expect(approve(ids[2])).rejects.toThrow('Administrator access');
 }finally{await db.close()}
},20000);
