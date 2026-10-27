// @vitest-environment node
import { describe,it,expect,beforeAll,afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync,writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { purchaseOrderPdf } from './pdf';
import { purchaseOrderSchema } from './schema';
const db=new PGlite();
const uid='00000000-0000-4000-8000-000000000001',iid='00000000-0000-4000-8000-000000000002';
const date=new Date().toISOString().slice(0,10);
const input={requestId:'10000000-0000-4000-8000-000000000001',date,requestedBy:'Kevin Lee',approvedBy:'',requestedDate:date,approvedDate:'',items:[{itemId:iid,quantity:10,specification:'Left hand',location:'Block A'}]};
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql as $$ select '${uid}'::uuid $$;
 create function public.is_admin() returns boolean language sql as $$ select current_setting('app.admin',true)='yes' $$;
 create function public.is_management() returns boolean language sql as $$ select public.is_admin() $$;
 create table profiles(id uuid primary key);insert into profiles values('${uid}');
 create table inventory_items(id uuid primary key,item_code text,description text,unit text,is_active boolean);
 insert into inventory_items values('${iid}','B00022','WINDOW HANDLE','pcs',true);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 set app.admin='yes';`);
 await db.exec(readFileSync('supabase/migrations/20261021083933_inventory_purchase_orders.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261021091937_inventory_purchase_order_edits.sql','utf8'));
},30000);
afterAll(()=>db.close());
describe('PO save',()=>{
 it('starts at 0030, snapshots item code and retries without another number',async()=>{
 const save=()=>db.query<{o:{po_no:string;items:{code:string}[]}}>('select save_inventory_purchase_order($1) o',[JSON.stringify(input)]);
 const a=(await save()).rows[0].o;expect(a.po_no).toBe('KH/KLG/PO/2026-0030');expect(a.items[0].code).toBe('B00022');
 expect((await save()).rows[0].o.po_no).toBe(a.po_no);
 expect((await db.query('select * from inventory_purchase_orders')).rows).toHaveLength(1);
 });
 it('rolls back numbering when item or quantity is invalid',async()=>{
 await expect(db.query('select save_inventory_purchase_order($1)',[JSON.stringify({...input,requestId:crypto.randomUUID(),items:[{...input.items[0],quantity:0}]})])).rejects.toThrow('Invalid quantity');
 expect((await db.query<{last_number:number}>('select last_number from inventory_po_counters where year=2026')).rows[0].last_number).toBe(30);
 });
 it('denies staff',async()=>{
 await db.exec("set app.admin='no'");await expect(db.query('select save_inventory_purchase_order($1)',[JSON.stringify(input)])).rejects.toThrow('Administrator access required');await db.exec("set app.admin='yes'");
 });
 it('has RLS on both tables and no anonymous privileges',async()=>{
 const r=await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where relname in ('inventory_po_counters','inventory_purchase_orders')");expect(r.rows.every(x=>x.relrowsecurity)).toBe(true);
 await db.exec('set role anon');await expect(db.query('select * from inventory_purchase_orders')).rejects.toThrow('permission denied');await db.exec('reset role');
 });
 it('edits the same PO, archives revisions and rejects stale changes without consuming a number',async()=>{
 const previous=(await db.query<{id:string}>('select id from inventory_purchase_orders limit 1')).rows[0];
 const patch={...input,orderId:previous.id,expectedRevision:1,requestId:crypto.randomUUID(),items:[...input.items,{...input.items[0],quantity:7,location:'External Area'}]};
 const edit=()=>db.query<{o:{revision:number;po_no:string;items:unknown[]}}>('select edit_inventory_purchase_order($1) o',[JSON.stringify(patch)]);
 const saved=(await edit()).rows[0].o;
 expect(saved.po_no).toBe('KH/KLG/PO/2026-0030');expect(saved.revision).toBe(2);expect(saved.items).toHaveLength(2);
 expect((await edit()).rows[0].o.revision).toBe(2);
 expect((await db.query('select * from inventory_po_revisions')).rows).toHaveLength(2);
 expect((await db.query<{last_number:number}>('select last_number from inventory_po_counters where year=2026')).rows[0].last_number).toBe(30);
 await expect(db.query('select edit_inventory_purchase_order($1)',[JSON.stringify({...patch,requestId:crypto.randomUUID()})])).rejects.toThrow('changed by another');
 await db.exec("set app.admin='no'");await expect(edit()).rejects.toThrow('Administrator access required');await db.exec("set app.admin='yes'");
 });
 it('starts each future year at 0001 and preserves earlier orders',async()=>{
 const sql=readFileSync('supabase/migrations/20261021083933_inventory_purchase_orders.sql','utf8');
 const func=sql.slice(sql.indexOf('create function'),sql.indexOf('revoke all on function'));
 for(const year of [2027,2028,2029]){
 await db.exec(func.replace('create function','create or replace function').replace("extract(year from (now() at time zone 'Asia/Kuala_Lumpur'))::integer",String(year)));
 const result=await db.query<{o:{po_no:string}}>('select save_inventory_purchase_order($1) o',[JSON.stringify({...input,requestId:crypto.randomUUID(),date:`${year}-01-01`})]);
 expect(result.rows[0].o.po_no).toBe(`KH/KLG/PO/${year}-0001`);
 }
 expect((await db.query('select * from inventory_purchase_orders')).rows).toHaveLength(4);
 });
});
it('rejects invalid dates and zero quantity',()=>{expect(purchaseOrderSchema.safeParse({...input,date:'2026-02-31'}).success).toBe(false);expect(purchaseOrderSchema.safeParse({...input,items:[{...input.items[0],quantity:0}]}).success).toBe(false);});
it('generates a real PDF and paginates a long order',async()=>{
 const order={id:crypto.randomUUID(),po_no:'KH/KLG/PO/2026-0030',order_date:'2026-10-21',requested_by:'Kevin Lee',approved_by:'',requested_date:'2026-10-21',approved_date:'',created_at:new Date().toISOString(),items:[{itemId:iid,code:'B00022',description:'WINDOW HANDLE',unit:'pcs',quantity:10,specification:'Left hand',location:'Block A'}]};
 const bytes=await purchaseOrderPdf(order);writeFileSync('/tmp/klgcr-po-sample.pdf',bytes);expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
 const long=await purchaseOrderPdf({...order,items:Array.from({length:30},()=>order.items[0])});writeFileSync('/tmp/klgcr-po-long.pdf',long);expect((await PDFDocument.load(long)).getPageCount()).toBeGreaterThan(1);
});
