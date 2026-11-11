// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261111085336_checkout_room_progress.sql", "utf8");

it("classifies and pages check-out progress under the existing management role", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create function is_management() returns boolean language sql stable as $$
        select current_setting('app.role', true) in ('admin', 'management_viewer')
      $$;
      create table blocks(id integer primary key, code text);
      create table profiles(id integer primary key, full_name text);
      create table checkout_rooms(id integer primary key, reference_no text, room_no text, status text, assigned_to integer,
        cleaner_id integer, created_at timestamptz default now(), block_id integer, utmspace_defects text, deleted_at timestamptz);
      create table checkout_defects(checkout_room_id integer, description text, status text);
      create table checkout_paint_tasks(checkout_room_id integer, status text);
      grant select on blocks, profiles, checkout_rooms, checkout_defects, checkout_paint_tasks to authenticated;
      insert into blocks values (1, 'A'), (2, 'B');
      insert into profiles values (1, 'Maintenance'), (2, 'Cleaner');
      insert into checkout_rooms (id, reference_no, room_no, status, assigned_to, cleaner_id, block_id, utmspace_defects, deleted_at) values
        (1, 'COR-1', 'B-9', 'second_inspection', null, null, 2, 'Wall Moldy', null),
        (2, 'COR-2', 'B-12', 'second_inspection', null, null, 2, 'Painting', null),
        (3, 'COR-3', '203', 'second_inspection', null, null, 1, 'Wall Moldy', null),
        (4, 'COR-4', '204', 'second_inspection', null, null, 1, '  No Defect.  ', null),
        (5, 'COR-5', '205', 'verification', 1, null, 1, 'Fan', null),
        (6, 'COR-6', '206', 'verification', 1, 2, 1, 'Fan', null),
        (7, 'COR-7', '207', 'ready_for_occupancy', null, null, 1, 'No defect', null),
        (8, 'COR-8', '208', 'second_inspection', null, null, 1, 'Painting', now());
      insert into checkout_defects values (1, 'Wall Moldy', 'open'), (2, 'Painting', 'open'),
        (3, 'Wall Moldy', 'open'), (3, 'Fan', 'open'), (4, 'No Defect.', 'open'),
        (5, 'Fan', 'rectified'), (6, 'Fan', 'rectified'), (8, 'Painting', 'open');
      insert into checkout_paint_tasks values (1, 'in_progress'), (1, 'completed'), (2, 'cancelled');
    `);
    await db.exec(migration);
    await db.exec("set role authenticated; set app.role = 'management_viewer'");
    const visible = await db.query("select id, defect_count, progress_status, can_assign_cleaner, can_assign_painting, painting_status from checkout_room_progress order by id");
    expect(visible.rows).toEqual([
      { id: 1, defect_count: 1, progress_status: "painting_only", can_assign_cleaner: false, can_assign_painting: false, painting_status: "in_progress" },
      { id: 2, defect_count: 1, progress_status: "painting_only", can_assign_cleaner: false, can_assign_painting: true, painting_status: null },
      { id: 3, defect_count: 2, progress_status: "awaiting_maintenance", can_assign_cleaner: false, can_assign_painting: false, painting_status: null },
      { id: 4, defect_count: 0, progress_status: "no_defect_cleaner", can_assign_cleaner: true, can_assign_painting: false, painting_status: null },
      { id: 5, defect_count: 1, progress_status: "repair_complete_cleaner", can_assign_cleaner: true, can_assign_painting: false, painting_status: null },
      { id: 6, defect_count: 1, progress_status: "verification", can_assign_cleaner: false, can_assign_painting: false, painting_status: null },
      { id: 7, defect_count: 0, progress_status: "ready_for_occupancy", can_assign_cleaner: false, can_assign_painting: false, painting_status: null },
    ]);
    const page = await db.query(`select id from checkout_room_progress
      where block_code = 'B' and progress_status = 'painting_only' and search_room like 'B%'
      order by status_rank, block_code, sort_room_prefix, sort_room_number, reference_no, id offset 1 limit 1`);
    expect(page.rows).toEqual([{ id: 2 }]);

    await db.exec("set app.role = 'cleaner'");
    expect((await db.query("select id from checkout_room_progress")).rows).toEqual([]);
    await db.exec("reset role; set role anon");
    await expect(db.query("select id from checkout_room_progress")).rejects.toThrow("permission denied");
  } finally {
    await db.close();
  }
}, 30_000);
