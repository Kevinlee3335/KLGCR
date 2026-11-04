// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('limits the queue and atomically assigns only rooms ready for cleaning',async()=>{
 const db=new PGlite();
 const ana='00000000-0000-4000-8000-000000000001',mary='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',cleaner='00000000-0000-4000-8000-000000000004',room='00000000-0000-4000-8000-000000000005';
 try {
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create table profiles(id uuid primary key,username text,full_name text,role text,is_active boolean,deleted_at timestamptz);
 create table blocks(id int primary key,code text);
 create table checkout_rooms(id uuid primary key,reference_no text,room_no text,block_id int,status text,utmspace_defects text,cleaner_id uuid,deleted_at timestamptz);
 create table checkout_defects(checkout_room_id uuid,description text,status text);
 create table checkout_history(checkout_room_id uuid,actor_id uuid,action text,from_status text,to_status text);
 insert into profiles values('${ana}','ana','Ana','cleaner',true,null),('${mary}','mary','Mary','admin',true,null),('${other}','other','Other','admin',true,null),('${cleaner}','worker','Worker','cleaner',true,null);
 insert into blocks values(1,'A');insert into checkout_rooms values('${room}','COR-1','101',1,'verification','Broken light',null,null);insert into checkout_defects values('${room}','Broken light','rectified');grant usage on schema public,auth to authenticated;`);
 await db.exec(readFileSync('supabase/migrations/20261104065133_checkout_housekeeping_assignment.sql','utf8'));
 await db.exec(`set role authenticated;set app.uid='${other}'`);
 await expect(db.query('select checkout_housekeeping_queue()')).rejects.toThrow('Not authorized');
 await expect(db.query('select assign_checkout_cleaner($1,$2)',[room,cleaner])).rejects.toThrow('Not authorized');
 await db.exec(`set app.uid='${ana}'`);
 const q=await db.query<{checkout_housekeeping_queue:{rooms:unknown[]}}>('select checkout_housekeeping_queue()');expect(q.rows[0].checkout_housekeeping_queue.rooms).toHaveLength(1);
 await db.query('select assign_checkout_cleaner($1,$2)',[room,cleaner]);
 await expect(db.query('select assign_checkout_cleaner($1,$2)',[room,cleaner])).rejects.toThrow('no longer available');
 await db.exec('reset role');expect((await db.query('select cleaner_id,status from checkout_rooms')).rows[0]).toEqual({cleaner_id:cleaner,status:'cleaning'});expect((await db.query('select actor_id from checkout_history')).rows[0]).toEqual({actor_id:ana});
 await db.exec(`update checkout_rooms set cleaner_id=null,status='verification';update checkout_defects set status='open';set role authenticated;set app.uid='${mary}'`);
 await expect(db.query('select assign_checkout_cleaner($1,$2)',[room,cleaner])).rejects.toThrow('no longer available');
 }finally{await db.close()}
},20000);
