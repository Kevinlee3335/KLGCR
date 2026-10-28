// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
const admin='00000000-0000-4000-8000-000000000001',abdullah='00000000-0000-4000-8000-000000000002',faiz='00000000-0000-4000-8000-000000000003',inactive='00000000-0000-4000-8000-000000000004',room='00000000-0000-4000-8000-000000000010';
it('transfers only as admin, preserves repaired items and atomically audits the handover',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create table profiles(id uuid primary key,full_name text,role text,is_active boolean default true);
 create function public.is_admin() returns boolean language sql as $$select exists(select 1 from profiles where id=auth.uid() and role='admin')$$;
 create table checkout_rooms(id uuid primary key,reference_no text,room_no text,assigned_to uuid,status text,deleted_at timestamptz);
 create table checkout_history(checkout_room_id uuid,actor_id uuid,action text,notes text,from_status text,to_status text);
 create table checkout_defects(id int,checkout_room_id uuid,status text,rectified_by uuid);
 create table checkout_photos(id int,checkout_room_id uuid,storage_path text);
 insert into profiles values('${admin}','Kevin','admin',true),('${abdullah}','Abdullah','maintenance_staff',true),('${faiz}','Faiz','maintenance_staff',true),('${inactive}','Faiz old','maintenance_staff',false);
 insert into checkout_rooms values('${room}','TEST-COR','805','${abdullah}','rectification',null);
 insert into checkout_defects values(1,'${room}','rectified','${abdullah}'),(2,'${room}','open',null);
 insert into checkout_photos values(1,'${room}','unchanged/photo.jpg');
 grant usage on schema public,auth to authenticated;grant select on profiles to authenticated;
 grant select,update on checkout_rooms to authenticated;grant select,insert on checkout_history to authenticated;
 alter table checkout_rooms enable row level security;
 create policy participants on checkout_rooms for select to authenticated using(is_admin() or assigned_to=auth.uid());
 create policy admins_transfer on checkout_rooms for update to authenticated using(is_admin()) with check(is_admin());`);
 await db.exec(readFileSync('supabase/migrations/20261028082608_checkout_task_transfer.sql','utf8'));
 await db.exec(`set role authenticated;set app.uid='${abdullah}'`);
 const transfer=(to:string,previous=abdullah,reason='Balance workload')=>db.query('select transfer_checkout_task($1,$2,$3,$4)',[room,to,previous,reason]);
 await expect(transfer(faiz)).rejects.toThrow('Only administrators');
 await db.exec(`set app.uid='${admin}'`);
 await expect(transfer(inactive)).rejects.toThrow('active Abdullah or Faiz');
 await transfer(faiz);
 expect((await db.query('select assigned_to,status from checkout_rooms')).rows[0]).toEqual({assigned_to:faiz,status:'rectification'});
 const events=(await db.query<{actor_id:string;notes:string}>('select actor_id,notes from checkout_history')).rows;expect(events).toHaveLength(1);expect(events[0].actor_id).toBe(admin);expect(events[0].notes).toContain('Abdullah → Faiz');
 await db.exec(`set app.uid='${abdullah}'`);expect((await db.query('select id from checkout_rooms')).rows).toHaveLength(0);await db.exec(`set app.uid='${faiz}'`);expect((await db.query('select id from checkout_rooms')).rows).toHaveLength(1);await db.exec(`set app.uid='${admin}'`);
 await expect(transfer(abdullah,abdullah)).rejects.toThrow('assignee has changed');
 await expect(transfer(faiz,faiz)).rejects.toThrow('different maintenance');
 await expect(transfer(abdullah,faiz,'')).rejects.toThrow('transfer reason');
 await db.exec('reset role');
 expect((await db.query('select status,rectified_by from checkout_defects where id=1')).rows[0]).toEqual({status:'rectified',rectified_by:abdullah});expect((await db.query('select * from checkout_photos')).rows).toHaveLength(1);
 await db.exec('alter table checkout_history add constraint audit_failure check(false) not valid;set role authenticated');
 await expect(transfer(abdullah,faiz)).rejects.toThrow('audit_failure');expect((await db.query('select assigned_to from checkout_rooms')).rows[0]).toEqual({assigned_to:faiz});
 await db.exec(`reset role;alter table checkout_history drop constraint audit_failure;update checkout_rooms set deleted_at=now();set role authenticated`);
 await expect(transfer(abdullah,faiz)).rejects.toThrow('Only an assigned room');
 }finally{await db.close()}
},20000);
