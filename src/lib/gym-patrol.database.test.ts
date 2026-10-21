// @vitest-environment node
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {it,expect} from "vitest";
it("blocks Gym Patrol from other module data even where existing policies allow all authenticated users",async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role authenticated;create schema auth;create schema storage;
   create type public.app_role as enum ('admin','maintenance_staff','cleaner','management_viewer');
   create function auth.uid() returns uuid language sql stable as $$select current_setting('test.uid')::uuid$$;
   create table profiles(id uuid primary key,role app_role,is_active boolean default true);
   create function public.current_role() returns app_role language sql stable security definer set search_path='' as $$select role from public.profiles where id=auth.uid() and is_active$$;
   create function public.update_assigned_daily_task(bigint,text,text) returns void language plpgsql security definer as $$begin return; end$$;
   create function public.materialize_recurring_tasks(date) returns void language plpgsql security definer as $$begin return; end$$;
   create table inventory_items(id int);create table calendar_events(id int);create table storage.objects(id int);
   alter table profiles enable row level security;alter table inventory_items enable row level security;alter table calendar_events enable row level security;alter table storage.objects enable row level security;
   create policy legacy_read on inventory_items for all to authenticated using(true) with check(true);
   create policy legacy_read on calendar_events for all to authenticated using(true) with check(true);
   create policy legacy_read on storage.objects for all to authenticated using(true) with check(true);
   create policy own_profile on profiles for select to authenticated using(id=auth.uid());
   grant usage on schema auth,storage to authenticated;
   grant all on inventory_items,calendar_events,storage.objects,profiles to authenticated;`);
  await db.exec(readFileSync('supabase/migrations/20261021064634_gym_patrol_access.sql','utf8'));
  await db.exec(`insert into profiles values('00000000-0000-4000-8000-000000000001','gym_patrol',true),('00000000-0000-4000-8000-000000000002','maintenance_staff',true);
   insert into inventory_items values(1);insert into calendar_events values(1);insert into storage.objects values(1);
   set test.uid='00000000-0000-4000-8000-000000000001';set role authenticated;`);
  expect((await db.query('select * from profiles')).rows).toHaveLength(1);
  await expect(db.query("select update_assigned_daily_task(1,'completed',null)")).rejects.toThrow('read only');
  await expect(db.query("select materialize_recurring_tasks(current_date)")).rejects.toThrow('read only');
  for(const table of ['inventory_items','calendar_events','storage.objects']) {
   expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
   await expect(db.query(`insert into ${table} values(2)`)).rejects.toThrow('row-level security');
  }
  await db.exec("reset role;set test.uid='00000000-0000-4000-8000-000000000002';set role authenticated;");
  expect((await db.query('select * from inventory_items')).rows).toHaveLength(1);
  await db.query('insert into inventory_items values(2)');
 }finally{await db.close();}
},30000);
