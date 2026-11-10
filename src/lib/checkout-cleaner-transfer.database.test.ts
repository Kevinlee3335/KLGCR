// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';

const admin='00000000-0000-4000-8000-000000000001';
const cleanerA='00000000-0000-4000-8000-000000000002';
const cleanerB='00000000-0000-4000-8000-000000000003';
const inactive='00000000-0000-4000-8000-000000000004';
const notCleaner='00000000-0000-4000-8000-000000000005';
const deleted='00000000-0000-4000-8000-000000000006';
const room='00000000-0000-4000-8000-000000000010';

it('transfers a cleaning task atomically without losing work and rejects unauthorized or stale transfers', async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth;
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
  create table profiles(id uuid primary key,full_name text,role text,is_active boolean default true,deleted_at timestamptz);
  create function public.is_admin() returns boolean language sql as $$select exists(select 1 from profiles where id=auth.uid() and role='admin')$$;
  create table checkout_rooms(id uuid primary key,reference_no text,room_no text,status text,cleaner_id uuid,deleted_at timestamptz);
  create table checkout_history(checkout_room_id uuid,actor_id uuid,action text,notes text,from_status text,to_status text);
  create table checkout_defects(id int,checkout_room_id uuid,status text);
  create table checkout_photos(id int,checkout_room_id uuid,storage_path text);
  insert into profiles values
   ('${admin}','Admin','admin',true,null),
   ('${cleanerA}','Fadhil','cleaner',true,null),
   ('${cleanerB}','Ariffin','cleaner',true,null),
   ('${inactive}','Unavailable','cleaner',false,null),
   ('${notCleaner}','Abdullah','maintenance_staff',true,null),
   ('${deleted}','Old Cleaner','cleaner',true,now());
  insert into checkout_rooms values('${room}','TEST-COR','601','cleaning','${cleanerA}',null);
  insert into checkout_defects values(1,'${room}','rectified');
  insert into checkout_photos values(1,'${room}','kept/photo.jpg');
  grant usage on schema public,auth to authenticated;
  grant select on profiles to authenticated;
  grant select,update on checkout_rooms to authenticated;
  grant select,insert on checkout_history to authenticated;
  alter table checkout_rooms enable row level security;
  create policy room_read on checkout_rooms for select to authenticated using(is_admin() or cleaner_id=auth.uid());
  create policy room_change on checkout_rooms for update to authenticated using(is_admin()) with check(is_admin());`);

  await db.exec(readFileSync('supabase/migrations/20261110061502_checkout_cleaner_task_transfer.sql','utf8'));
  const transfer=(to:string,expected=cleanerA,reason='Balance cleaner workload')=>
   db.query('select transfer_checkout_cleaner_task($1,$2,$3,$4)',[room,to,expected,reason]);

  await db.exec(`set role authenticated; set app.uid='${cleanerA}'`);
  await expect(transfer(cleanerB)).rejects.toThrow('Only administrators');

  await db.exec(`set app.uid='${admin}'`);
  await expect(transfer(inactive)).rejects.toThrow('active cleaner');
  await expect(transfer(notCleaner)).rejects.toThrow('active cleaner');
  await expect(transfer(deleted)).rejects.toThrow('active cleaner');
  await expect(transfer(cleanerA)).rejects.toThrow('different cleaner');
  await expect(transfer(cleanerB,cleanerA,'')).rejects.toThrow('transfer reason');
  await transfer(cleanerB);

  expect((await db.query('select cleaner_id,status from checkout_rooms')).rows[0])
   .toEqual({cleaner_id:cleanerB,status:'cleaning'});
  const events=(await db.query<{actor_id:string;action:string;notes:string;from_status:string;to_status:string}>('select * from checkout_history')).rows;
  expect(events).toHaveLength(1);
  expect(events[0].action).toBe('cleaner_task_transferred');
  expect(events[0].notes).toContain('Fadhil → Ariffin');
  expect(events[0].from_status).toBe('cleaning');
  expect(events[0].to_status).toBe('cleaning');

  await db.exec(`set app.uid='${cleanerA}'`);
  expect((await db.query('select id from checkout_rooms')).rows).toHaveLength(0);
  await db.exec(`set app.uid='${cleanerB}'`);
  expect((await db.query('select id from checkout_rooms')).rows).toHaveLength(1);
  await db.exec(`set app.uid='${admin}'`);
  await expect(transfer(cleanerA,cleanerA)).rejects.toThrow('cleaner has changed');
  await expect(transfer(cleanerB,cleanerB)).rejects.toThrow('different cleaner');

  await db.exec('reset role');
  expect((await db.query('select status from checkout_defects')).rows[0]).toEqual({status:'rectified'});
  expect((await db.query('select storage_path from checkout_photos')).rows[0]).toEqual({storage_path:'kept/photo.jpg'});

  await db.exec('alter table checkout_history add constraint fail_audit check(false) not valid; set role authenticated');
  await expect(transfer(cleanerA,cleanerB)).rejects.toThrow('fail_audit');
  expect((await db.query('select cleaner_id from checkout_rooms')).rows[0]).toEqual({cleaner_id:cleanerB});

  await db.exec("reset role;alter table checkout_history drop constraint fail_audit;update checkout_rooms set status='ready_for_occupancy';set role authenticated");
  await expect(transfer(cleanerA,cleanerB)).rejects.toThrow('awaiting cleaning');
  await db.exec("reset role;update checkout_rooms set status='cleaning',deleted_at=now();set role authenticated");
  await expect(transfer(cleanerA,cleanerB)).rejects.toThrow('awaiting cleaning');
 }finally{await db.close();}
},20000);
