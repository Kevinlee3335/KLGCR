// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('persists hide/restore for all brands atomically, scopes stores and preserves stock', async()=>{
 const db=new PGlite();
 const a=crypto.randomUUID(),b=crypto.randomUUID(),office=crypto.randomUUID();
 try {
 await db.exec(`create role anon;create role authenticated;
 create function public.is_admin() returns boolean language sql as $$select coalesce(current_setting('app.admin',true),'false')='true'$$;
 create table inventory_items(id uuid primary key,item_code text,inventory_group text,is_active boolean,balance_qty numeric);
 alter table inventory_items enable row level security;
 create policy read_inventory on inventory_items for select to authenticated using(true);
 create policy update_inventory on inventory_items for update to authenticated using(is_admin()) with check(is_admin());
 grant select,update on inventory_items to authenticated;`);
 await db.query("insert into inventory_items values($1,'KLGCR-P00003','building',true,11),($2,'KLGCR-P00013','building',true,0),($3,'OFF-0001','office',true,3)",[a,b,office]);
 await db.exec(readFileSync('supabase/migrations/20261030071306_inventory_procurement_modes_and_brand_groups.sql','utf8'));
 await db.exec("set app.admin='true';set role authenticated");
 const change=(ids:string[],mode='buy_when_needed')=>db.query<{changed:number}>('select set_inventory_procurement_mode($1,\'building\',$2) as changed',[ids,mode]);
 expect((await change([a])).rows[0].changed).toBe(2);
 expect((await db.query("select procurement_mode,balance_qty from inventory_items where inventory_group='building' order by item_code")).rows).toEqual([{procurement_mode:'buy_when_needed',balance_qty:'11'},{procurement_mode:'buy_when_needed',balance_qty:'0'}]);
 await change([b],'maintain_stock');
 expect((await db.query("select * from inventory_items where procurement_mode='buy_when_needed'")).rows).toHaveLength(0);
 await expect(change([a,office])).rejects.toThrow('unavailable');
 expect((await db.query("select * from inventory_items where procurement_mode='buy_when_needed'")).rows).toHaveLength(0);
 await expect(change([])).rejects.toThrow('Select between');
 await expect(change([a],'invalid')).rejects.toThrow('Invalid');
 await db.exec("set app.admin='false'");await expect(change([a])).rejects.toThrow('Administrator');
 await db.exec('reset role;set role anon');await expect(change([a])).rejects.toThrow('permission denied');
 } finally {await db.close();}
},30000);
