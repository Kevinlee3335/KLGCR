// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('assigns and transfers rooms to active maintenance staff without depending on their name',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
   create type checkout_status as enum ('second_inspection','rectification','cleaning');
   create table profiles(id uuid primary key,full_name text,role text,is_active boolean,deleted_at timestamptz);
   create function public.is_admin() returns boolean language sql as $$select exists(select 1 from profiles where id=auth.uid() and role='admin')$$;
   create table checkout_rooms(id uuid primary key,reference_no text,room_no text,assigned_to uuid,cleaner_id uuid,status checkout_status,utmspace_defects text,deleted_at timestamptz);
   create table checkout_defects(checkout_room_id uuid,description text,status text);
   create table checkout_history(checkout_room_id uuid,actor_id uuid,action text,notes text,from_status checkout_status,to_status checkout_status);
   insert into profiles values ('00000000-0000-4000-8000-000000000001','Admin','admin',true,null),('00000000-0000-4000-8000-000000000002','General Worker','maintenance_staff',true,null),('00000000-0000-4000-8000-000000000003','Abdullah','maintenance_staff',true,null),('00000000-0000-4000-8000-000000000004','Former worker','maintenance_staff',false,null),('00000000-0000-4000-8000-000000000005','Cleaner','cleaner',true,null);
   insert into checkout_rooms values ('00000000-0000-4000-8000-000000000010','TEST','101',null,null,'second_inspection','broken',null);
   insert into checkout_defects values ('00000000-0000-4000-8000-000000000010','broken','open');
   set app.uid='00000000-0000-4000-8000-000000000001';`);
  await db.exec(readFileSync('scripts/sql/checkout_assignment_workers.sql','utf8'));
  const id='00000000-0000-4000-8000-000000000010',worker='00000000-0000-4000-8000-000000000002',inactive='00000000-0000-4000-8000-000000000004',cleaner='00000000-0000-4000-8000-000000000005',abdullah='00000000-0000-4000-8000-000000000003';
  const assign=(who:string)=>db.query('select bulk_assign_checkout_rooms($1,$2,$3)',[[id],who,'maintenance']);
  await expect(assign(inactive)).rejects.toThrow('active worker'); await expect(assign(cleaner)).rejects.toThrow('active worker');
  await assign(worker); expect((await db.query('select assigned_to,status from checkout_rooms')).rows[0]).toEqual({assigned_to:worker,status:'rectification'});
  await db.query('select transfer_checkout_task($1,$2,$3,$4)',[id,abdullah,worker,'Balance workload']);
  await db.query('select transfer_checkout_task($1,$2,$3,$4)',[id,worker,abdullah,'Balance workload']);
  expect((await db.query('select assigned_to from checkout_rooms')).rows[0]).toEqual({assigned_to:worker});
  expect((await db.query('select action from checkout_history')).rows).toHaveLength(3);
 }finally{await db.close()}
},20000);
