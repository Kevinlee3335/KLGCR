// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('records and deducts office stock atomically, rejects unsafe withdrawals and scopes history',async()=>{
 const db=new PGlite(),employee=crypto.randomUUID(),other=crypto.randomUUID(),viewer=crypto.randomUUID(),inactive=crypto.randomUUID(),office=crypto.randomUUID(),building=crypto.randomUUID(),unknown=crypto.randomUUID(),request=crypto.randomUUID();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create table profiles(id uuid primary key,full_name text,role text,is_active boolean,deleted_at timestamptz);
 create table inventory_items(id uuid primary key,item_code text,description text,unit text,inventory_group text,is_active boolean,quantity_unverified boolean,balance_qty numeric,updated_at timestamptz);
 grant select on profiles,inventory_items to authenticated;`);
 for(const [id,name,role,active] of [[employee,'Employee A','cleaner',true],[other,'Employee B','maintenance_staff',true],[viewer,'Viewer','management_viewer',true],[inactive,'Inactive','admin',false]] as const)await db.query('insert into profiles values($1,$2,$3,$4,null)',[id,name,role,active]);
 for(const [id,code,group,unverified] of [[office,'OFF-0001','office',false],[building,'KLGCR-B00001','building',false],[unknown,'OFF-0022','office',true]] as const)await db.query("insert into inventory_items values($1,$2,'Paper','RIM',$3,true,$4,5,now())",[id,code,group,unverified]);
 await db.exec(readFileSync('supabase/migrations/20261027065746_office_inventory_usage.sql','utf8'));
 await db.exec(`set app.uid='${employee}';set role authenticated;`);
 const take=(rid=request,item=office,qty=2,name='Alice')=>db.query<{v:{id:string;balance_after:number}}>('select take_office_inventory($1,$2,$3,$4,$5) v',[rid,item,qty,name,'Office use']);
 const entry=(await take()).rows[0].v;expect(Number(entry.balance_after)).toBe(3);
 expect((await take()).rows[0].v.id).toBe(entry.id);
 await expect(take(request,office,1)).rejects.toThrow('already recorded');
 for(const qty of [0,-1,4,0.001])await expect(take(crypto.randomUUID(),office,qty)).rejects.toThrow();
 await expect(take(crypto.randomUUID(),building,1)).rejects.toThrow('Office item');
 await expect(take(crypto.randomUUID(),unknown,1)).rejects.toThrow('confirm the stock');
 expect(Number((await db.query<{balance_qty:number}>('select balance_qty from inventory_items where id=$1',[office])).rows[0].balance_qty)).toBe(3);
 expect((await db.query('select * from office_inventory_usage')).rows).toHaveLength(1);
 await expect(db.query('delete from office_inventory_usage')).rejects.toThrow('permission denied');
 await db.exec(`set app.uid='${other}'`);expect((await db.query('select * from office_inventory_usage')).rows).toHaveLength(0);
 await db.exec(`set app.uid='${viewer}'`);expect((await db.query('select * from office_inventory_usage')).rows).toHaveLength(1);await expect(take(crypto.randomUUID())).rejects.toThrow('Employee access');
 await db.exec(`set app.uid='${inactive}'`);await expect(take(crypto.randomUUID())).rejects.toThrow('Employee access');
 await db.exec('reset role;set role anon');await expect(db.query('select take_office_inventory($1,$2,1,$3,$4)',[crypto.randomUUID(),office,'Alice',''])).rejects.toThrow('permission denied');
 }finally{await db.close();}
},30000);
