// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('routes a cleaner-reported defect through maintenance and completes cleaning directly after repair',async()=>{
 const db=new PGlite(); try {
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create table profiles(id uuid primary key,username text,full_name text,role text,is_active boolean,deleted_at timestamptz);
 create function is_admin() returns boolean language sql as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and is_active)$$;
 create function is_management() returns boolean language sql as $$select is_admin()$$;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 create table storage.objects(bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;
 create table blocks(id smallint,code text);
 create type checkout_status as enum('second_inspection','rectification','cleaning','verification','ready_for_occupancy');
 create table checkout_rooms(id uuid primary key,reference_no text default 'TEST',block_id smallint,room_no text,utmspace_defects text,inspection_notes text,occupancy_pax smallint,created_by uuid,status checkout_status default 'second_inspection',assigned_to uuid,cleaner_id uuid,deleted_at timestamptz,ready_at timestamptz);
 create table checkout_defects(id uuid default gen_random_uuid(),checkout_room_id uuid,description text,source text check(source in ('utmspace','second_inspection')),created_by uuid,status text default 'open');
 create table checkout_photos(checkout_room_id uuid,defect_id uuid,kind text,storage_path text,uploaded_by uuid);
 create table checkout_history(checkout_room_id uuid,actor_id uuid,action text,notes text,from_status checkout_status,to_status checkout_status);
 insert into profiles values('00000000-0000-4000-8000-000000000001','fadhil','Fadhil','cleaner',true,null),('00000000-0000-4000-8000-000000000002','ariffin','Ariffin','cleaner',true,null),('00000000-0000-4000-8000-000000000003','ana','Ana','cleaner',true,null),('00000000-0000-4000-8000-000000000004','fikri','Fikri','admin',true,null),('00000000-0000-4000-8000-000000000005','mary','Mary','admin',true,null),('00000000-0000-4000-8000-000000000006','abdullah','Abdullah','maintenance_staff',true,null);
 insert into blocks values(1,'A'),(2,'B');
 grant usage on schema public,storage,auth to authenticated;grant select,insert,update on all tables in schema public to authenticated;grant select,insert on storage.objects to authenticated;`);
 await db.exec(readFileSync('supabase/migrations/20261030033750_checkout_room_inspection_and_bulk_assign.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261105140000_checkout_inspection_and_cleaning.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261113071638_checkout_cleaner_report_defect.sql','utf8'));
 await db.exec("set role authenticated;set app.uid='00000000-0000-4000-8000-000000000001'");
 const room='00000000-0000-4000-8000-000000000010';
 await db.query("select submit_ab_checkout_inspection($1,'A','987',2,'test','{}',$2::jsonb)",[room,JSON.stringify([{description:'Window handle broken',photos:[]}])]);
 expect((await db.query('select description from checkout_defects where checkout_room_id=$1',[room])).rows).toEqual([{description:'Window handle broken'}]);
 expect((await db.query('select * from checkout_photos')).rows).toHaveLength(0);
 await db.exec("set app.uid='00000000-0000-4000-8000-000000000003'");
 await expect(db.query("select submit_ab_checkout_inspection('00000000-0000-4000-8000-000000000011','A','988',2,'test','{}','[]')")).rejects.toThrow('Not authorized');
 await expect(db.query('select checkout_housekeeping_queue()')).rejects.toThrow('Not authorized');
 await db.exec("set app.uid='00000000-0000-4000-8000-000000000004'");
 await expect(db.query('select checkout_housekeeping_queue()')).resolves.toBeDefined();
 await db.query("update checkout_defects set status='rectified' where checkout_room_id=$1",[room]);
 await db.query("update checkout_rooms set status='verification' where id=$1",[room]);
 await db.query("select assign_checkout_cleaner($1,'00000000-0000-4000-8000-000000000002')",[room]);
 await db.exec("set app.uid='00000000-0000-4000-8000-000000000002'");

 const report = (descriptions: string[]) => db.query(
  'select report_checkout_cleaning_defects($1,$2::text[])', [room, descriptions],
 );
 await db.exec("set app.uid='00000000-0000-4000-8000-000000000001'");
 await expect(report(['Room · Lighting · Not Working'])).rejects.toThrow('no longer assigned');
 await db.exec("set app.uid='00000000-0000-4000-8000-000000000002'");
 await expect(report(['No Defect'])).rejects.toThrow('valid defects');

 await db.exec("reset role;alter table checkout_history add constraint fail_report check(action <> 'cleaner_defects_reported');set role authenticated");
 await expect(report(['Room · Lighting · Not Working'])).rejects.toThrow('fail_report');
 expect((await db.query('select status from checkout_rooms where id=$1',[room])).rows).toEqual([{status:'cleaning'}]);
 expect((await db.query("select description from checkout_defects where source='cleaner'")).rows).toHaveLength(0);
 await db.exec("reset role;alter table checkout_history drop constraint fail_report;set role authenticated");

 await report(['Room · Lighting · Not Working', 'Room · Lighting · Not Working']);
 await expect(report(['Room · Lighting · Not Working'])).rejects.toThrow('no longer assigned');
 await expect(db.query('select complete_checkout_cleaning($1)',[room])).rejects.toThrow('no longer assigned');
 expect((await db.query('select status,assigned_to,cleaner_id,ready_at from checkout_rooms where id=$1',[room])).rows)
  .toEqual([{status:'second_inspection',assigned_to:null,cleaner_id:null,ready_at:null}]);
 expect((await db.query('select description,source,status,created_by from checkout_defects where checkout_room_id=$1 order by source',[room])).rows)
  .toEqual([
   {description:'Room · Lighting · Not Working',source:'cleaner',status:'open',created_by:'00000000-0000-4000-8000-000000000002'},
   {description:'Window handle broken',source:'second_inspection',status:'rectified',created_by:'00000000-0000-4000-8000-000000000001'},
  ]);
 expect((await db.query("select from_status,to_status from checkout_history where action='cleaner_defects_reported'")).rows)
  .toEqual([{from_status:'cleaning',to_status:'second_inspection'}]);

 await db.exec("set app.uid='00000000-0000-4000-8000-000000000004'");
 await expect(report(['Room · Lighting · Not Working'])).rejects.toThrow('Not authorized');
 await db.query("select bulk_assign_checkout_rooms(array[$1]::uuid[],'00000000-0000-4000-8000-000000000006','maintenance')",[room]);
 await db.query("update checkout_defects set status='rectified' where checkout_room_id=$1",[room]);
 await db.query("update checkout_rooms set status='verification' where id=$1",[room]);
 await db.query("select assign_checkout_cleaner($1,'00000000-0000-4000-8000-000000000002')",[room]);
 await db.exec("set app.uid='00000000-0000-4000-8000-000000000002'");
 await db.query('select complete_checkout_cleaning($1)',[room]);
 await expect(report(['Room · Lighting · Not Working'])).rejects.toThrow('no longer assigned');
 expect((await db.query('select status,ready_at is not null as has_date from checkout_rooms where id=$1',[room])).rows).toEqual([{status:'ready_for_occupancy',has_date:true}]);
 expect((await db.query("select to_status from checkout_history where action='cleaning_completed'")).rows).toEqual([{to_status:'ready_for_occupancy'}]);
 } finally {await db.close()}
},20000);
