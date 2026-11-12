// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const migration = readFileSync("supabase/migrations/20261112092300_compliance_expiry_reminders.sql", "utf8");

it("uses Malaysia calendar stages, creates one daily summary per active Admin, and stops at completion", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      create table profiles(id uuid primary key, role text, is_active boolean, deleted_at timestamptz);
      create table compliance_records(id uuid primary key, title text, record_type text, location text);
      create table compliance_cycles(id uuid primary key, record_id uuid references compliance_records(id), due_date date, status text);
      create table app_notifications(id uuid primary key, recipient_id uuid references profiles(id), type text, title text, body text, href text, entity_id uuid);
      grant select on profiles, compliance_records, compliance_cycles to authenticated, service_role;
      grant insert on app_notifications to service_role;
      insert into profiles values
        ('${uid(1)}','admin',true,null), ('${uid(2)}','admin',true,null),
        ('${uid(3)}','management_viewer',true,null), ('${uid(4)}','admin',false,null),
        ('${uid(5)}','admin',true,now());
      insert into compliance_records values
        ('${uid(11)}','Fire extinguisher renewal','certificate_license','Block D'),
        ('${uid(12)}','Lift servicing','servicing','Block A'),
        ('${uid(13)}','Standby genset servicing','servicing',null),
        ('${uid(14)}','Agreement renewal','agreement',null);
      with malaysia as (select (now() at time zone 'Asia/Kuala_Lumpur')::date as today)
      insert into compliance_cycles
        select '${uid(21)}'::uuid,'${uid(11)}'::uuid,today - 1,'open' from malaysia union all
        select '${uid(22)}','${uid(12)}',today + 3,'open' from malaysia union all
        select '${uid(23)}','${uid(13)}',today + 15,'open' from malaysia union all
        select '${uid(24)}','${uid(13)}',today - 5,'completed' from malaysia union all
        select '${uid(25)}','${uid(14)}',today + 4,'open' from malaysia;
    `);
    await db.exec(migration);

    const stages = await db.query<{ stage: string | null }>(`
      select public.compliance_expiry_stage(due, today) as stage
      from (values
        (date '2026-03-31', date '2026-02-28'),
        (date '2026-03-31', date '2026-03-01'),
        (date '2026-10-27', date '2026-10-12'),
        (date '2026-10-27', date '2026-10-24'),
        (date '2026-10-27', date '2026-11-15')
      ) dates(due, today);
    `);
    expect(stages.rows.map(row => row.stage)).toEqual(["month_before", null, "fifteen_days", "daily", "daily"]);

    await db.exec(`set role authenticated; set test.uid='${uid(3)}';`);
    expect((await db.query("select * from public.compliance_expiry_follow_ups()")).rows).toEqual([]);
    await expect(db.query("select public.queue_compliance_expiry_reminders()")).rejects.toThrow("permission denied");
    await expect(db.query("select * from public.compliance_expiry_push_outbox")).rejects.toThrow("permission denied");
    await db.exec(`set test.uid='${uid(1)}';`);
    expect((await db.query<{ cycle_id: string }>("select * from public.compliance_expiry_follow_ups()")).rows.map(row => row.cycle_id))
      .toEqual([uid(21), uid(22), uid(23)]);

    await db.exec("reset role; set role service_role;");
    await db.query("select public.queue_compliance_expiry_reminders()");
    await db.query("select public.queue_compliance_expiry_reminders()");
    const claimed = await db.query<{ recipient_id: string; body: string; href: string; expires_at: string }>(
      "select * from public.claim_compliance_expiry_pushes($1)", [uid(31)]);
    expect(claimed.rows).toHaveLength(2);
    expect(new Set(claimed.rows.map(row => row.recipient_id))).toEqual(new Set([uid(1), uid(2)]));
    expect(claimed.rows.every(row => row.href === "/admin#compliance-expiry-reminders")).toBe(true);
    expect(claimed.rows.every(row => row.body === "3 records need follow-up. 1 overdue, 1 due within 3 days, 1 at 15 days.")).toBe(true);
    expect((await db.query("select * from public.claim_compliance_expiry_pushes($1)", [uid(32)])).rows).toEqual([]);

    await db.exec("reset role;");
    expect((await db.query("select * from public.app_notifications where type='compliance_expiry'")).rows).toHaveLength(2);
    await db.exec(`
      update compliance_cycles set status='completed' where id='${uid(21)}';
      update profiles set role='management_viewer' where id='${uid(2)}';
      update compliance_expiry_push_outbox set locked_until=now()-interval '1 minute';
      set role service_role;
    `);
    const retried = await db.query<{ recipient_id: string; body: string }>("select * from public.claim_compliance_expiry_pushes($1)", [uid(33)]);
    expect(retried.rows).toHaveLength(1);
    expect(retried.rows[0]).toMatchObject({
      recipient_id: uid(1),
      body: "2 records need follow-up. 1 due within 3 days, 1 at 15 days.",
    });

    await db.exec(`reset role; set role authenticated; set test.uid='${uid(1)}';`);
    expect((await db.query<{ cycle_id: string }>("select * from public.compliance_expiry_follow_ups()")).rows.map(row => row.cycle_id))
      .toEqual([uid(22), uid(23)]);

    await db.exec(`
      reset role;
      update compliance_cycles set status='completed';
      update compliance_expiry_push_outbox set locked_until=now()-interval '1 minute';
      set role service_role;
    `);
    expect((await db.query("select * from public.claim_compliance_expiry_pushes($1)", [uid(34)])).rows).toEqual([]);
  } finally { await db.close(); }
}, 20000);
