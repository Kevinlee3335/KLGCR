// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('removes rooms reversibly, preserves evidence and rejects staff removal or stale writes',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create function public.is_admin() returns boolean language sql as $$select current_setting('app.role',true)='admin'$$;
 create table checkout_rooms(id int primary key,updated_at timestamptz default now(),status text);
 create table checkout_defects(id int,checkout_room_id int references checkout_rooms(id));
 create table checkout_photos(id int,checkout_room_id int references checkout_rooms(id));
 insert into checkout_rooms(id,status) values(1,'rectification'),(2,'rectification');
 insert into checkout_defects values(1,1);insert into checkout_photos values(1,1);`);
 await db.exec(readFileSync('supabase/migrations/20261028082303_checkout_soft_delete.sql','utf8'));
 await db.exec(`set app.uid='00000000-0000-4000-8000-000000000001';set app.role='maintenance_staff'`);
 await expect(db.exec('update checkout_rooms set deleted_at=now() where id=1')).rejects.toThrow('Only administrators');
 await db.exec(`set app.role='admin';update checkout_rooms set deleted_at=now(),deletion_reason='Date range cleanup' where id=1`);
 expect((await db.query('select id from checkout_rooms where deleted_at is null')).rows).toEqual([{id:2}]);
 expect((await db.query('select id from checkout_defects')).rows).toHaveLength(1);expect((await db.query('select id from checkout_photos')).rows).toHaveLength(1);
 await expect(db.exec("update checkout_rooms set status='verification' where id=1")).rejects.toThrow('removed from active work');
 await db.exec(`set app.uid='';update checkout_rooms set deleted_at=null,deletion_reason=null where id=1`);
 expect((await db.query('select id from checkout_rooms where deleted_at is null')).rows).toHaveLength(2);
 }finally{await db.close()}
},20000);
