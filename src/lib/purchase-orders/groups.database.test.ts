// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('isolates categories, signatures, approvers and confirmed destinations',async()=>{
 const db=new PGlite();
 const james='eeab5f04-30c3-42bd-a095-58e56c814358',kevin='00000000-0000-4000-8000-000000000001',item='00000000-0000-4000-8000-000000000002';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql as $$ select current_setting('app.uid')::uuid $$;
 create function public.is_admin() returns boolean language sql as $$ select true $$;
 create function public.is_management() returns boolean language sql as $$ select true $$;
 create table profiles(id uuid primary key,is_active boolean default true,deleted_at timestamptz,full_name text default 'Kevin Lee');insert into profiles(id) values('${kevin}'),('${james}');
 create table app_notifications(id uuid default gen_random_uuid(),recipient_id uuid,type text,title text,body text,href text,entity_id uuid);
 create table inventory_items(id uuid primary key,item_code text,description text,unit text,is_active boolean);
 insert into inventory_items values('${item}','WIN01','Window handle','pcs',true);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 set app.uid='${kevin}';`);
 for(const file of ['20261021083933_inventory_purchase_orders.sql','20261021091937_inventory_purchase_order_edits.sql','20261022043502_inventory_po_approval.sql','20261022044454_inventory_po_notifications.sql','20261022045002_po_e_signatures.sql','20261022051353_po_name_only_approval.sql','20261027090000_inventory_groups_signatures.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));

 const mary='1767d3e4-c907-45fe-8ed0-e433c0d0dca7',office=crypto.randomUUID(),cleaner=crypto.randomUUID();
 await db.query("insert into profiles(id,full_name) values($1,'Mary Tan')",[mary]);
 await db.query("insert into inventory_items(id,item_code,description,unit,is_active,inventory_group) values($1,'OFF-0001','Paper','RIM',true,'office'),($2,'CLN-0001','Mop','PCS',true,'cleaner')",[office,cleaner]);
 const drawing={strokes:[[[0.1,0.7],[0.3,0.2],[0.4,0.8],[0.7,0.4]]]};
 for(const id of [kevin,james,mary])await db.query('insert into user_e_signatures(user_id,signature) values($1,$2)',[id,JSON.stringify(drawing)]);
 const payload=(ids:string[])=>({useSignature:true,requestId:crypto.randomUUID(),date:new Date().toISOString().slice(0,10),requestedBy:'Kevin',requestedDate:'2026-10-27',items:ids.map(itemId=>({itemId,quantity:1}))});
 const save=async(ids:string[]) => (await db.query<{o:Record<string,unknown>}>('select save_inventory_purchase_order($1) o',[JSON.stringify(payload(ids))])).rows[0].o;
 await expect(save([office,item])).rejects.toThrow('one inventory group');
 await expect(save([office,cleaner])).rejects.toThrow('one inventory group');
 const o=await save([office]);expect(o.requested_signature).toEqual(drawing);
 await db.exec(`set app.uid='${james}'`);
 await expect(db.query('select approve_inventory_purchase_order($1,1)',[o.id])).rejects.toThrow('designated approver');
 await db.exec(`set app.uid='${mary}'`);
 const approved=(await db.query<{o:Record<string,unknown>}>('select approve_inventory_purchase_order($1,1) o',[o.id])).rows[0].o;
 expect(approved.approved_by).toBe('Mary Tan');expect(approved.approved_signature).toEqual(drawing);
 expect((await db.query<{status:string;recipient:null}>('select status,recipient from inventory_po_dispatch where order_id=$1',[o.id])).rows).toEqual([{status:'awaiting_recipient',recipient:null}]);
 await db.query('select approve_inventory_purchase_order($1,2)',[o.id]);
 expect((await db.query('select * from inventory_po_dispatch where order_id=$1',[o.id])).rows).toHaveLength(1);
 await db.exec(`set app.uid='${kevin}'`);
 const b=await save([item]);await db.exec(`set app.uid='${mary}'`);
 await expect(db.query('select approve_inventory_purchase_order($1,1)',[b.id])).rejects.toThrow('designated approver');
 await db.exec(`set app.uid='${james}'`);await db.query('select approve_inventory_purchase_order($1,1)',[b.id]);
 expect((await db.query<{status:string;recipient:string}>('select status,recipient from inventory_po_dispatch where order_id=$1',[b.id])).rows).toEqual([{status:'pending',recipient:'purchasing@keanlenggroup.com'}]);
 await db.exec(`set app.uid='${kevin}'`);const c=await save([cleaner]);await db.exec(`set app.uid='${mary}'`);await db.query('select approve_inventory_purchase_order($1,1)',[c.id]);
 expect((await db.query<{recipient_ids:string[];status:string}>('select recipient_ids,status from inventory_po_dispatch where order_id=$1',[c.id])).rows).toEqual([{recipient_ids:['7a40e00f-2e95-4c27-83d9-0f7dba788b77','657a0fb1-aa05-4f3c-bd67-3914313a69d1'],status:'pending'}]);
 await db.query("update inventory_procurement_routes set recipient_ids=ARRAY[$1::uuid],confirmed=true where inventory_group='cleaner'",[kevin]);
 await db.exec(`set app.uid='${kevin}'`);const confirmedCleaner=await save([cleaner]);await db.exec(`set app.uid='${mary}'`);await db.query('select approve_inventory_purchase_order($1,1)',[confirmedCleaner.id]);
 expect((await db.query<{recipient_ids:string[];status:string}>('select recipient_ids,status from inventory_po_dispatch where order_id=$1',[confirmedCleaner.id])).rows).toEqual([{recipient_ids:[kevin],status:'pending'}]);
 await db.query("update inventory_procurement_routes set recipient='supplier@example.test',confirmed=true where inventory_group='office'");
 await db.exec(`set app.uid='${kevin}'`);const confirmedOffice=await save([office]);await db.exec(`set app.uid='${mary}'`);await db.query('select approve_inventory_purchase_order($1,1)',[confirmedOffice.id]);
 expect((await db.query<{recipient:string;status:string}>('select recipient,status from inventory_po_dispatch where order_id=$1',[confirmedOffice.id])).rows).toEqual([{recipient:'supplier@example.test',status:'pending'}]);
 }finally{await db.close();}
},30000);
