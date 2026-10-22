// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll,afterAll,it,expect } from 'vitest';
const db=new PGlite();
const staff='00000000-0000-4000-8000-000000000001',item='00000000-0000-4000-8000-000000000002',order='00000000-0000-4000-8000-000000000003';
const request={orderId:order,expectedRevision:1,requestId:'00000000-0000-4000-8000-000000000004',note:'DN 001',items:[{itemId:item,quantity:8}]};
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql as $$ select '${staff}'::uuid $$;
 create function public.is_admin() returns boolean language sql as $$ select current_setting('app.admin',true)='yes' $$;
 create function public.is_management() returns boolean language sql as $$ select public.is_admin() $$;
 create table profiles(id uuid primary key);insert into profiles values('${staff}');
 create type inventory_movement_category as enum ('fast','slow','once_in_a_while');
 create type inventory_adjustment_type as enum ('stock_in','correction_add','correction_remove');
 create table inventory_items(id uuid primary key default gen_random_uuid(),item_code text unique,description text,unit text,is_active boolean,category text,movement_category inventory_movement_category,balance_qty numeric default 0,reorder_level numeric default 0,updated_at timestamptz default now());
 insert into inventory_items(id,item_code,description,unit,is_active,category,movement_category,balance_qty) values('${item}','B00001','Window Handle','pcs',true,'Building','slow',5);
 create table inventory_adjustment_history(id bigint generated always as identity primary key,inventory_item_id uuid,adjustment_type inventory_adjustment_type,qty numeric,balance_before numeric,balance_after numeric,note text,adjusted_by uuid,adjusted_at timestamptz default now());
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 set app.admin='yes';`);
 for(const path of ['20261021083933_inventory_purchase_orders.sql','20261021091937_inventory_purchase_order_edits.sql'])await db.exec(readFileSync('supabase/migrations/'+path,'utf8'));
 const original=readFileSync('supabase/migrations/202609010001_phase4_material_inventory.sql','utf8');
 await db.exec(original.slice(original.indexOf('create function public.adjust_inventory_item'),original.indexOf('revoke all on function public.create_material_request')));
 await db.exec(readFileSync('supabase/migrations/20261022032100_inventory_po_receipts.sql','utf8'));
 await db.query("insert into inventory_purchase_orders(id,request_id,po_no,order_date,requested_by,items,created_by) values($1,$2,'KH/KLG/PO/2026-0030','2026-10-22','Kevin',$3,$4)",[order,crypto.randomUUID(),JSON.stringify([{itemId:item,code:'B00001',description:'Window Handle',unit:'pcs',quantity:10},{itemId:item,code:'B00001',description:'Window Handle',unit:'pcs',quantity:10}]),staff]);
},30000);
afterAll(()=>db.close());
const receive=(payload:unknown)=>db.query<{r:{receipt:{id:string};order:{received_quantities:Record<string,number>}}}>('select receive_inventory_purchase_order($1) r',[JSON.stringify(payload)]);
it('receives 8 of 20, increases existing stock from 5 to 13 and records stock history',async()=>{
 const r=(await receive(request)).rows[0].r;expect(r.order.received_quantities[item]).toBe(8);
 expect((await db.query<{balance_qty:string}>('select balance_qty from inventory_items where id=$1',[item])).rows[0].balance_qty).toBe('13');
 expect((await db.query('select * from inventory_adjustment_history')).rows).toHaveLength(1);
 expect((await db.query<{sheet_status:string}>('select sheet_status from inventory_po_receipts')).rows[0].sheet_status).toBe('pending');
});
it('retries the same receipt without adding inventory twice',async()=>{
 await receive(request);expect((await db.query('select * from inventory_po_receipts')).rows).toHaveLength(1);
 expect((await db.query<{balance_qty:string}>('select balance_qty from inventory_items where id=$1',[item])).rows[0].balance_qty).toBe('13');
});
it('rejects excess, duplicate, stale and nonpositive receipts atomically',async()=>{
 for(const patch of [{items:[{itemId:item,quantity:13}]},{items:[{itemId:item,quantity:0}]},{items:[{itemId:item,quantity:1},{itemId:item,quantity:1}]},{expectedRevision:99}])await expect(receive({...request,requestId:crypto.randomUUID(),...patch})).rejects.toThrow();
 expect((await db.query('select * from inventory_po_receipts')).rows).toHaveLength(1);
});
it('protects pending delivery balances from an old Google import',async()=>{
 await db.query('select import_inventory_sheet_rows($1)',[JSON.stringify([{item_code:'B00001',description:'Window Handle',category:'Building',movement_category:'slow',balance_qty:5,reorder_level:1,unit:'pcs'}])]);
 expect((await db.query<{balance_qty:string}>('select balance_qty from inventory_items where id=$1',[item])).rows[0].balance_qty).toBe('13');
});
it('protects the live service-role import while a receipt is pending',async()=>{
 await db.exec('grant select,update on inventory_items to service_role;set role service_role');
 await db.query('update inventory_items set balance_qty=1 where id=$1',[item]);
 expect((await db.query<{balance_qty:string}>('select balance_qty from inventory_items where id=$1',[item])).rows[0].balance_qty).toBe('13');
 await db.exec('reset role');
});
it('receives remaining 12, prevents over-receiving and prevents editing below delivered quantity',async()=>{
 await receive({...request,requestId:crypto.randomUUID(),items:[{itemId:item,quantity:12}]});
 expect((await db.query<{balance_qty:string}>('select balance_qty from inventory_items where id=$1',[item])).rows[0].balance_qty).toBe('25');
 await expect(receive({...request,requestId:crypto.randomUUID(),items:[{itemId:item,quantity:1}]})).rejects.toThrow('exceeds remaining');
 await expect(db.query('update inventory_purchase_orders set items=$1 where id=$2',[JSON.stringify([{itemId:item,quantity:19}]),order])).rejects.toThrow('below its received');
});
it('serializes outgoing Google sync per item',async()=>{
 expect((await db.query<{ok:boolean}>('select claim_po_sheet_item($1,$2) ok',[item,crypto.randomUUID()])).rows[0].ok).toBe(true);
 expect((await db.query<{ok:boolean}>('select claim_po_sheet_item($1,$2) ok',[item,crypto.randomUUID()])).rows[0].ok).toBe(false);
});
it('rejects non-admin receiving and protects receipts from public access',async()=>{
 await db.exec("set app.admin='no'");await expect(receive({...request,requestId:crypto.randomUUID()})).rejects.toThrow('Administrator access');await db.exec("set app.admin='yes';set role anon");await expect(db.query('select * from inventory_po_receipts')).rejects.toThrow('permission denied');await db.exec('reset role');
});
