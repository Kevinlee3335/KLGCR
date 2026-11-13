// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const admin = "00000000-0000-4000-8000-000000000001";
const staff = "00000000-0000-4000-8000-000000000002";
const nextStaff = "00000000-0000-4000-8000-000000000003";
const complaint = "00000000-0000-4000-8000-000000000011";
const job = "00000000-0000-4000-8000-000000000012";
const hose = "00000000-0000-4000-8000-000000000013";
const seal = "00000000-0000-4000-8000-000000000014";
const photo = `${job}/completion/00000000-0000-4000-8000-000000000015.jpg`;

const migration = (name: string) => readFileSync(`supabase/migrations/${name}.sql`, "utf8");

async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}

async function requestMaterial(items = [{ inventory_item_id: hose, qty: 2 }]) {
  const { rows } = await db.query<{ id: string }>("select create_material_request($1,'Need parts',$2::jsonb) as id", [job, JSON.stringify(items)]);
  return rows[0].id;
}

async function hasPendingApproval() {
  const { rows } = await db.query<{ pending: boolean }>("select has_pending_job_material_approval($1) as pending", [job]);
  return rows[0].pending;
}

function completeJob(legacy = false) {
  return legacy
    ? db.query("select complete_assigned_job($1,'  Repaired leak  ')", [job])
    : db.query("select complete_assigned_job($1,'  Repaired leak  ',$2::text[])", [job, [photo]]);
}

async function expectPendingApprovalRejection(legacy = false) {
  await db.exec("savepoint before_completion");
  try {
    await expect(completeJob(legacy)).rejects.toMatchObject({
      code: "P0001",
      message: "Material request is still pending approval",
    });
  } finally {
    await db.exec("rollback to savepoint before_completion; release savepoint before_completion");
  }
}

async function expectStock(balance: string, issues: number) {
  expect((await db.query("select balance_qty from inventory_items where id=$1", [hose])).rows).toEqual([{ balance_qty: balance }]);
  expect((await db.query("select count(*)::int as count from inventory_issue_history where job_id=$1", [job])).rows).toEqual([{ count: issues }]);
}

beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth to authenticated;
  `);
  for (const name of [
    "202608240001_phase1_foundation",
    "202608260001_phase2_complaints_jobs",
    "202608270001_phase3_staff_job_workflow",
    "202609010001_phase4_material_inventory",
  ]) {
    await db.exec(migration(name).replace(/^create extension.*;$/gm, ""));
  }
  // Only the unrelated appointment, checkout, and existing photo schema needed by these migrations.
  await db.exec(`
    create table public.appointments(id uuid primary key);
    create table public.checkout_rooms(id uuid primary key);
    create table public.maintenance_job_photos(
      id uuid primary key default gen_random_uuid(),
      job_id uuid not null references public.maintenance_jobs(id),
      storage_path text not null,
      uploaded_by uuid not null references public.profiles(id)
    );
    alter table public.material_request_items add column other_item_name text;
    alter table public.material_requests alter column job_id drop not null;
    alter table public.material_requests add column checkout_room_id uuid references public.checkout_rooms(id);
    alter table public.inventory_issue_history alter column job_id drop not null;
    alter table public.inventory_issue_history add column checkout_room_id uuid references public.checkout_rooms(id);
  `);
  for (const name of [
    "20261003045000_maintenance_team_report_visibility",
    "20261029030124_material_request_additional_items",
    "20261029041959_material_request_item_approval",
    "20261113050433_maintenance_material_completion_approval",
  ]) {
    await db.exec(migration(name));
  }
  await db.query("insert into auth.users(id,email) values($1,'admin@example.test'),($2,'worker@example.test'),($3,'next@example.test')", [admin, staff, nextStaff]);
  await db.query("update public.profiles set role='admin' where id=$1", [admin]);
  await db.query("insert into public.profile_blocks(profile_id,block_id) values($1,1),($2,1)", [staff, nextStaff]);
  await db.query("insert into public.complaints(id,block_id,room_no,category,description) values($1,1,'A110','Plumbing','Leak')", [complaint]);
  await db.query("insert into public.maintenance_jobs(id,complaint_id,block_id,room_no,category,description,priority,assigned_to,status) values($1,$2,1,'A110','Plumbing','Leak','normal',$3,'in_progress')", [job, complaint, staff]);
  await db.query("insert into public.inventory_items(id,item_code,description,category,balance_qty) values($1,'HOSE','Hose','Plumbing',10),($2,'SEAL','Seal','Plumbing',10)", [hose, seal]);
}, 30000);

beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback; reset role"); });
afterAll(async () => { await db.close(); });

describe("Maintenance job completion and material approval", () => {
  it("blocks a pending request from the previous assignee even after the job resumes", async () => {
    await asUser(staff);
    expect(await hasPendingApproval()).toBe(false);
    await requestMaterial();
    await db.query("select resume_assigned_job($1)", [job]);

    await asUser(admin);
    await db.query("update maintenance_jobs set assigned_to=$2 where id=$1", [job, nextStaff]);
    await asUser(nextStaff);
    expect((await db.query("select id from material_requests where job_id=$1", [job])).rows).toEqual([]);
    expect(await hasPendingApproval()).toBe(true);
    await expectPendingApprovalRejection();
    await expectPendingApprovalRejection(true);

    await db.exec("reset role");
    expect((await db.query("select status,completed_at from maintenance_jobs where id=$1", [job])).rows).toEqual([{ status: "in_progress", completed_at: null }]);
    expect((await db.query("select storage_path from maintenance_job_photos where job_id=$1", [job])).rows).toEqual([]);
    await expectStock("10.00", 0);
  });

  it("keeps completion blocked while an item still needs approval after partial issue", async () => {
    await asUser(staff);
    const request = await requestMaterial([{ inventory_item_id: hose, qty: 2 }, { inventory_item_id: seal, qty: 1 }]);

    await asUser(admin);
    const { rows: [line] } = await db.query<{ id: string }>("select id from material_request_items where request_id=$1 and inventory_item_id=$2", [request, hose]);
    await db.query("select approve_material_request_item($1,$2)", [request, line.id]);
    await expectStock("10.00", 0);
    await db.query("select issue_material_request_items($1,$2)", [request, line.id]);
    await expectStock("8.00", 1);

    await asUser(staff);
    expect(await hasPendingApproval()).toBe(true);
    await expectPendingApprovalRejection();
    expect((await db.query("select status from maintenance_jobs where id=$1", [job])).rows).toEqual([{ status: "pending_material" }]);
    await asUser(admin);
    await expectStock("8.00", 1);
  });

  it.each([
    { state: "approved but unissued", issued: false },
    { state: "issued", issued: true },
  ])("completes a job with $state material", async ({ issued }) => {
    await asUser(staff);
    const request = await requestMaterial();
    await asUser(admin);
    await db.query("select review_material_request($1,true,null)", [request]);
    await expectStock("10.00", 0);
    if (issued) await db.query("select issue_material_request($1)", [request]);

    await asUser(staff);
    expect(await hasPendingApproval()).toBe(false);
    await completeJob();
    expect((await db.query("select status,action_taken from maintenance_jobs where id=$1", [job])).rows).toEqual([{ status: "completed", action_taken: "Repaired leak" }]);
    expect((await db.query("select new_status,changed_by from job_status_history where job_id=$1 and new_status='completed'", [job])).rows).toEqual([{ new_status: "completed", changed_by: staff }]);
    expect((await db.query("select status from material_requests where id=$1", [request])).rows).toEqual([{ status: issued ? "issued" : "approved" }]);

    await db.exec("reset role");
    expect((await db.query("select storage_path,uploaded_by from maintenance_job_photos where job_id=$1", [job])).rows).toEqual([{ storage_path: photo, uploaded_by: staff }]);
    await expectStock(issued ? "8.00" : "10.00", issued ? 1 : 0);

    if (!issued) {
      await asUser(admin);
      await db.query("select issue_material_request($1)", [request]);
      await expectStock("8.00", 1);
    }
  });
});
