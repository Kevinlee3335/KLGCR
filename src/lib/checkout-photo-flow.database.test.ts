// @vitest-environment node
import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import {it,expect} from "vitest";
const admin="00000000-0000-4000-8000-000000000001",tech="00000000-0000-4000-8000-000000000002",cleaner="00000000-0000-4000-8000-000000000003",other="00000000-0000-4000-8000-000000000004",room="00000000-0000-4000-8000-000000000010";
it("retains seven inspection and seven completion photos across real RLS roles, reopens, cleaning and final verification",async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create type app_role as enum('admin','maintenance_staff','management_viewer');
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create table public.profiles(id uuid primary key,role text,full_name text,is_active boolean default true);
 create table public.blocks(id smallint primary key,code text);
 create function is_admin() returns boolean language sql stable as $$select exists(select 1 from profiles where id=auth.uid() and role='admin')$$;
 create function is_management() returns boolean language sql stable as $$select exists(select 1 from profiles where id=auth.uid() and role in ('admin','management_viewer'))$$;
 create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text unique,metadata jsonb);
 alter table storage.objects enable row level security;
 insert into profiles values('${admin}','admin','Kevin',true),('${tech}','maintenance_staff','Abdullah',true),('${cleaner}','cleaner','Fadhil',true),('${other}','maintenance_staff','Other worker',true);
 insert into blocks values(1,'A'),(2,'B');`);
 await db.exec(readFileSync("supabase/migrations/202609130001_checkout_room_workflow.sql","utf8"));
 await db.exec("alter table checkout_rooms add deleted_at timestamptz;alter table checkout_rooms add occupancy_pax smallint;");
 await db.exec(readFileSync("supabase/migrations/20261030033750_checkout_room_inspection_and_bulk_assign.sql","utf8"));
 await db.exec(`grant usage on schema public,storage,auth to authenticated;grant select on profiles,blocks to authenticated;grant select,insert on storage.objects to authenticated;set role authenticated;set app.uid='${admin}'`);
 const inspection=Array.from({length:7},(_,i)=>`${admin}/inspection/${room}/00000000-0000-4000-8000-${String(100+i).padStart(12,"0")}.jpg`);
 for(const path of inspection)await db.query("insert into storage.objects(bucket_id,name,metadata) values('checkout-evidence',$1,'{\"size\":10}')",[path]);
 await db.query("select submit_ab_checkout_inspection($1,'A','203',2,'Kevin inspection','{}',$2::jsonb)",[room,JSON.stringify([{description:"Fan · Broken · Qty 1",photos:inspection},{description:"Tap · Leaking · Qty 1",photos:[]}])]);
 await db.query("select bulk_assign_checkout_rooms($1,$2,'maintenance')",[[room],tech]);
 await db.exec(`set app.uid='${tech}'`);
 expect((await db.query("select * from checkout_photos where checkout_room_id=$1",[room])).rows).toHaveLength(7);
 expect((await db.query("select * from storage.objects")).rows).toHaveLength(7);
 await db.exec(`set app.uid='${other}'`);
 expect((await db.query("select * from checkout_rooms")).rows).toHaveLength(0);
 expect((await db.query("select * from checkout_photos")).rows).toHaveLength(0);
 expect((await db.query("select * from storage.objects")).rows).toHaveLength(0);
 await db.exec(`set app.uid='${tech}'`);
 const defects=(await db.query<{id:string}>("select id from checkout_defects order by description")).rows;
 const completed=Array.from({length:7},(_,i)=>`${room}/completion/00000000-0000-4000-8000-${String(200+i).padStart(12,"0")}.jpg`);
 for(const path of completed){
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('checkout-evidence',$1,'{\"size\":10}')",[path]);
  await db.query("insert into checkout_photos(checkout_room_id,defect_id,kind,storage_path,uploaded_by) values($1,$2,'completion',$3,$4)",[room,defects[0].id,path,tech]);
 }
 await db.query("update checkout_defects set status='rectified',rectified_by=$1,rectified_at=now() where id=$2",[tech,defects[0].id]);
 expect((await db.query("select status from checkout_rooms where id=$1",[room])).rows[0]).toEqual({status:"rectification"});
 await db.query("update checkout_defects set status='rectified',rectified_by=$1,rectified_at=now() where id=$2",[tech,defects[1].id]);
 await db.query("update checkout_rooms set status='verification' where id=$1",[room]);
 await db.exec(`set app.uid='${admin}'`);
 const reopened=await db.query<{kind:string;storage_path:string}>("select kind,storage_path from checkout_photos where checkout_room_id=$1",[room]);
 expect(reopened.rows.filter(p=>p.kind==="inspection")).toHaveLength(7);
 expect(reopened.rows.filter(p=>p.kind==="completion")).toHaveLength(7);
 expect((await db.query("select * from storage.objects")).rows).toHaveLength(14);
 await db.query("select bulk_assign_checkout_rooms($1,$2,'cleaner')",[[room],cleaner]);
 await db.exec(`set app.uid='${cleaner}'`);
 expect((await db.query("select * from checkout_photos")).rows).toHaveLength(14);
 const cleaning=room+"/cleaning/00000000-0000-4000-8000-000000000300.jpg";
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('checkout-evidence',$1,'{\"size\":10}')",[cleaning]);
 await db.query("insert into checkout_photos(checkout_room_id,kind,storage_path,uploaded_by) values($1,'cleaning',$2,$3)",[room,cleaning,cleaner]);
 await db.query("update checkout_rooms set status='verification' where id=$1",[room]);
 await db.exec(`set app.uid='${admin}'`);
 await db.query("update checkout_rooms set status='ready_for_occupancy',occupancy_pax=2,ready_at=now() where id=$1",[room]);
 expect((await db.query("select * from checkout_photos")).rows).toHaveLength(15);
 expect((await db.query("select status,occupancy_pax from checkout_rooms")).rows[0]).toEqual({status:"ready_for_occupancy",occupancy_pax:2});
 }finally{await db.close()}
},20000);
