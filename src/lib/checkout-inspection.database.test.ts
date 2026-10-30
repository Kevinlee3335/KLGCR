// @vitest-environment node
import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import {it,expect} from "vitest";
const admin="00000000-0000-4000-8000-000000000001",staff="00000000-0000-4000-8000-000000000002",cleaner="00000000-0000-4000-8000-000000000003";
it("atomically submits checklist defects/photos, prevents duplicate rooms and bulk assigns eligible rooms only",async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create table profiles(id uuid primary key,full_name text,role text,is_active boolean);
 create function is_admin() returns boolean language sql as $$select exists(select 1 from profiles where id=auth.uid() and role='admin')$$;
 create function is_management() returns boolean language sql as $$select is_admin()$$;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 create table storage.objects(bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;
 create table blocks(id smallint,code text);
 create type checkout_status as enum('second_inspection','rectification','cleaning','verification','ready_for_occupancy');
 create table checkout_rooms(id uuid primary key,reference_no text default 'TEST',block_id smallint,room_no text,utmspace_defects text,inspection_notes text,occupancy_pax smallint,created_by uuid,status checkout_status default 'second_inspection',assigned_to uuid,cleaner_id uuid,deleted_at timestamptz);
 create table checkout_defects(id uuid default gen_random_uuid(),checkout_room_id uuid,description text,source text,created_by uuid,status text default 'open');
 create table checkout_photos(checkout_room_id uuid,defect_id uuid,kind text,storage_path text,uploaded_by uuid);
 create table checkout_history(checkout_room_id uuid,actor_id uuid,action text,notes text,from_status checkout_status,to_status checkout_status);
 insert into profiles values('${admin}','Kevin','admin',true),('${staff}','Abdullah','maintenance_staff',true),('${cleaner}','Fadhil','cleaner',true);
 insert into blocks values(1,'A'),(2,'B');
 grant usage on schema public,storage,auth to authenticated;grant select,insert,update on all tables in schema public to authenticated;grant select,insert on storage.objects to authenticated;`);
 await db.exec(readFileSync("supabase/migrations/20261030033750_checkout_room_inspection_and_bulk_assign.sql","utf8"));
 await db.exec(`set role authenticated;set app.uid='${admin}'`);
 const id="00000000-0000-4000-8000-000000000010",id2="00000000-0000-4000-8000-000000000011";
 const path=`${admin}/inspection/${id}/00000000-0000-4000-8000-000000000012.jpg`;
 const submit=(rid:string,room:string,findings:unknown[])=>db.query("select submit_ab_checkout_inspection($1,'A',$2,2,'Inspector test','{}',$3::jsonb)",[rid,room,JSON.stringify(findings)]);
 await expect(submit(id,"203",[{description:"Fan · Broken",photos:[path]}])).rejects.toThrow("Photo upload is incomplete");
 expect((await db.query("select * from checkout_rooms")).rows).toHaveLength(0);
 await db.query("insert into storage.objects values('checkout-evidence',$1,'{\"size\":100}')",[path]);
 await submit(id,"203",[{description:"Fan · Broken",photos:[path]}]);
 await submit(id,"203",[{description:"Fan · Broken",photos:[path]}]);
 expect((await db.query("select * from checkout_rooms")).rows).toHaveLength(1);
 expect((await db.query("select * from checkout_defects")).rows).toHaveLength(1);
 expect((await db.query("select * from checkout_photos")).rows).toHaveLength(1);
 await expect(submit(id2,"203",[])).rejects.toThrow("already has an active");
 await submit(id2,"204",[]);
 const assign=(ids:string[],who:string,kind:string)=>db.query("select bulk_assign_checkout_rooms($1,$2,$3)",[ids,who,kind]);
 await expect(assign([id,id2],staff,"maintenance")).rejects.toThrow("no longer awaiting");
 expect((await db.query("select status from checkout_rooms where id=$1",[id])).rows[0]).toEqual({status:"second_inspection"});
 await assign([id],staff,"maintenance");await assign([id2],cleaner,"cleaner");
 expect((await db.query("select status from checkout_rooms order by room_no")).rows).toEqual([{status:"rectification"},{status:"cleaning"}]);
 await db.exec(`set app.uid='${staff}'`);
 expect((await db.query("select name from storage.objects")).rows).toHaveLength(1);
 await expect(assign([id],staff,"maintenance")).rejects.toThrow("Only administrators");
 await expect(submit("00000000-0000-4000-8000-000000000020","205",[])).rejects.toThrow("Only administrators");
 }finally{await db.close()}
},20000);
