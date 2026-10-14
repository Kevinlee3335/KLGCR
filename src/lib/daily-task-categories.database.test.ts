// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { resolveDailyTaskCategory } from "./daily-tasks";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create function public.is_admin() returns boolean language sql as $$select true$$;
    create table profiles(id uuid primary key,is_active boolean default true,deleted_at timestamptz);
    create table recurring_daily_tasks(id bigint generated always as identity primary key,title text,notes text,assigned_to uuid,created_by uuid,frequency text,day_number int,starts_on date,task_category text,is_active boolean default true);
    create table admin_daily_tasks(id bigint generated always as identity primary key,task_date date,title text,notes text,assigned_to uuid,created_by uuid,recurrence_id bigint,task_category text,unique(recurrence_id,task_date));`);
  await db.exec(readFileSync("supabase/migrations/20261007151500_fix_cleaner_recurring_task_materialization.sql", "utf8"));
}, 30000);
afterAll(async () => { await db.close(); });
it("creates and filters all departments, carries recurrence categories, and avoids duplicates", async () => {
  const id="00000000-0000-4000-8000-000000000001";
  await db.query("insert into profiles(id) values($1)",[id]);
  for (const role of ["admin","maintenance_staff","cleaner"]) {
    const category=resolveDailyTaskCategory({role,daily_task_category:null});
    await db.query("insert into admin_daily_tasks(task_date,title,assigned_to,created_by,task_category) values('2026-10-14','Once',$1,$1,$2)",[id,category]);
    for (const frequency of ["weekly","biweekly","monthly"]) {
      await db.query("insert into recurring_daily_tasks(title,assigned_to,created_by,frequency,day_number,starts_on,task_category) values($1,$2,$2,$3,$4,'2026-10-14',$5)",[frequency,id,frequency,frequency === "monthly" ? 14 : 3,category]);
    }
  }
  await db.query("select materialize_recurring_tasks('2026-10-14')");
  await db.query("select materialize_recurring_tasks('2026-10-14')");
  for (const category of ["admin","operation","housekeeping"]) {
    const tasks=await db.query<{title:string}>("select title from admin_daily_tasks where task_category=$1",[category]);
    expect(tasks.rows.map(row=>row.title).sort()).toEqual(["Once","biweekly","monthly","weekly"]);
  }
  await db.query("select materialize_recurring_tasks('2026-10-21')");
  expect((await db.query("select count(*)::int as n from admin_daily_tasks where task_date='2026-10-21'")).rows[0]).toEqual({n:3});
  await db.query("select materialize_recurring_tasks('2026-10-28')");
  expect((await db.query("select count(*)::int as n from admin_daily_tasks where task_date='2026-10-28'")).rows[0]).toEqual({n:6});
});
