// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();

beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create function public.is_management() returns boolean language sql as $$
      select coalesce(current_setting('test.app_role', true) in ('admin', 'management_viewer'), false);
    $$;
    create table public.maintenance_jobs (status text not null, visible boolean not null);
    create table public.inventory_items (
      balance_qty numeric not null, reorder_level numeric not null, is_active boolean not null, visible boolean not null
    );
    insert into public.maintenance_jobs values
      ('assigned', true), ('assigned', true), ('in_progress', true), ('pending_material', true),
      ('under_monitoring', true), ('cancelled', true), ('completed', false);
    insert into public.maintenance_jobs select 'completed', true from generate_series(1, 1201);
    insert into public.inventory_items values
      (0, 0, true, true), (0, 10, true, true), (1, 1, true, true), (1.01, 1, true, true),
      (0, 10, false, true), (0, 10, true, false);
    alter table public.maintenance_jobs enable row level security;
    alter table public.inventory_items enable row level security;
    create policy visible_jobs on public.maintenance_jobs for select to authenticated using (visible);
    create policy visible_stock on public.inventory_items for select to authenticated using (visible);
    grant select on public.maintenance_jobs, public.inventory_items to authenticated;
  `);
  await db.exec(readFileSync("supabase/migrations/20261111072640_admin_dashboard_workload_counts.sql", "utf8"));
}, 30000);

afterAll(async () => { await db.close(); });

it.each(["admin", "management_viewer"])("returns exact status and stock totals under %s row policies", async (role) => {
  await db.exec(`set role authenticated; set test.app_role = '${role}';`);
  const { rows } = await db.query("select * from public.admin_dashboard_workload_counts()");
  expect(rows).toEqual([{
    assigned: 2, in_progress: 1, pending_material: 1, under_monitoring: 1, completed: 1201,
    out_of_stock: 2, near_reorder: 1,
  }]);
  await db.exec("reset role");
});

it("denies anonymous execution and hides totals from staff", async () => {
  await db.exec("set role anon");
  await expect(db.query("select * from public.admin_dashboard_workload_counts()")).rejects.toThrow(/permission denied/);
  await db.exec("reset role; set role authenticated; set test.app_role = 'maintenance_staff'");
  expect((await db.query("select * from public.admin_dashboard_workload_counts()")).rows).toEqual([]);
  await db.exec("reset role");
});
