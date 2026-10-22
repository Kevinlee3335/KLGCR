// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import {readFileSync,writeFileSync} from 'node:fs';
import {purchaseOrderPdf} from './pdf';
import {it,expect} from 'vitest';
it('binds approval to James, timestamps it, rejects spoofing and invalidates edits',async()=>{
 const db=new PGlite();
 const james='eeab5f04-30c3-42bd-a095-58e56c814358',kevin='00000000-0000-4000-8000-000000000001',item='00000000-0000-4000-8000-000000000002';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql as $$ select current_setting('app.uid')::uuid $$;
 create function public.is_admin() returns boolean language sql as $$ select true $$;
 create function public.is_management() returns boolean language sql as $$ select true $$;
 create table profiles(id uuid primary key,is_active boolean default true,deleted_at timestamptz);insert into profiles(id) values('${kevin}'),('${james}');
 create table app_notifications(id uuid default gen_random_uuid(),recipient_id uuid,type text,title text,body text,href text,entity_id uuid);
 create table inventory_items(id uuid primary key,item_code text,description text,unit text,is_active boolean);
 insert into inventory_items values('${item}','WIN01','Window handle','pcs',true);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 set app.uid='${kevin}';`);
 for(const file of ['20261021083933_inventory_purchase_orders.sql','20261021091937_inventory_purchase_order_edits.sql','20261022043502_inventory_po_approval.sql','20261022044454_inventory_po_notifications.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 const payload={requestId:crypto.randomUUID(),date:new Date().toISOString().slice(0,10),requestedBy:'Kevin',approvedBy:'Forged James',approvedDate:'2026-10-22',requestedDate:'2026-10-22',items:[{itemId:item,quantity:1}]};
 const o=(await db.query<{o:{id:string;approved_at:null;approved_by:string}}>('select save_inventory_purchase_order($1) o',[JSON.stringify(payload)])).rows[0].o;
 expect(o.approved_at).toBeNull();expect(o.approved_by).toBe('');
 const requested=(await db.query<{recipient_id:string;type:string;href:string}>('select * from app_notifications')).rows;
 expect(requested).toHaveLength(1);expect(requested[0].recipient_id).toBe(james);expect(requested[0].type).toBe('po_approval_requested');expect(requested[0].href).toContain(o.id);
 await db.query('select save_inventory_purchase_order($1)',[JSON.stringify(payload)]);
 expect((await db.query('select * from app_notifications')).rows).toHaveLength(1);
 await expect(db.query('select approve_inventory_purchase_order($1,1)',[o.id])).rejects.toThrow('Only James');
 await expect(db.query("update inventory_purchase_orders set approved_by='James Ooi' where id=$1",[o.id])).rejects.toThrow('Only James');
 await db.exec(`set app.uid='${james}'`);
 const approved=(await db.query<{o:{revision:number;approved_by:string;approved_at:string}}>('select approve_inventory_purchase_order($1,1) o',[o.id])).rows[0].o;
 expect(approved.approved_by).toBe('James Ooi');expect(approved.approved_at).toBeTruthy();expect(approved.revision).toBe(2);
 const creatorAlerts=(await db.query<{recipient_id:string}>("select recipient_id from app_notifications where type='po_approved'")).rows;
 expect(creatorAlerts).toEqual([{recipient_id:kevin}]);
 expect((await db.query<{o:{approved_at:string}}>('select approve_inventory_purchase_order($1,2) o',[o.id])).rows[0].o.approved_at).toBe(approved.approved_at);
 await expect(db.query('select approve_inventory_purchase_order($1,1)',[o.id])).rejects.toThrow('changed by another');
 await db.exec(`set app.uid='${kevin}'`);
 const changed=(await db.query<{o:{approved_at:null;approved_by:string}}>('select edit_inventory_purchase_order($1) o',[JSON.stringify({...payload,orderId:o.id,requestId:crypto.randomUUID(),expectedRevision:2,items:[{itemId:item,quantity:2}]})])).rows[0].o;
 expect(changed.approved_at).toBeNull();expect(changed.approved_by).toBe('');
 expect((await db.query("select * from app_notifications where type='po_approval_requested'")).rows).toHaveLength(2);
 const first=(await db.query<{id:string}>('select id from inventory_po_notification_outbox limit 1')).rows[0];
 expect((await db.query<{claimed:boolean}>('select claim_po_notification($1,$2) claimed',[first.id,crypto.randomUUID()])).rows[0].claimed).toBe(true);
 expect((await db.query<{claimed:boolean}>('select claim_po_notification($1,$2) claimed',[first.id,crypto.randomUUID()])).rows[0].claimed).toBe(false);
 await db.exec('set role anon');await expect(db.query('select approve_inventory_purchase_order($1,3)',[o.id])).rejects.toThrow('permission denied');
 }finally{await db.close();}
},30000);

it('renders the automatic approver, date and Malaysian time',async()=>{
 const pdf=await purchaseOrderPdf({id:'sample',po_no:'KH/KLG/PO/2026-0030',order_date:'2026-10-22',requested_by:'Kevin Lee',requested_date:'2026-10-22',approved_by:'James Ooi',approved_date:'2026-10-22',approved_at:'2026-10-22T04:35:02Z',created_at:'2026-10-22T04:00:00Z',items:[{itemId:'sample',code:'KLGCR-B00001',description:'Window Handle',unit:'pcs',specification:'Left hand',quantity:10,location:'Block A'}]});
 writeFileSync('/workspace/scratch/e6859fe82f91/po-approved-sample.pdf',pdf);expect(pdf.length).toBeGreaterThan(1000);
});
