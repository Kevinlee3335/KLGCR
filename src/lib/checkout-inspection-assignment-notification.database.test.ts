// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("commits an inspection assignment and the assignee's bell notification together", async () => {
  const db = new PGlite();
  const admin = "00000000-0000-4000-8000-000000000001";
  const maintenance = "00000000-0000-4000-8000-000000000002";
  const otherWorker = "00000000-0000-4000-8000-000000000003";
  const room = "00000000-0000-4000-8000-000000000004";
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as
        $$select nullif(current_setting('app.uid', true), '')::uuid$$;
      create table profiles(id uuid primary key, role text not null, is_active boolean, deleted_at timestamptz);
      create function is_admin() returns boolean language sql as
        $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and is_active)$$;
      create table blocks(id smallint primary key, code text);
      create table checkout_rooms(id uuid primary key, block_id smallint, room_no text, reference_no text,
        status text, assigned_to uuid, inspection_notes text, deleted_at timestamptz);
      create table app_notifications(recipient_id uuid not null, type text, title text, body text, href text, entity_id uuid);
      alter table app_notifications enable row level security;
      create policy view_own_bell on app_notifications for select to authenticated using (recipient_id=auth.uid());
      grant usage on schema auth to authenticated;
      grant select, update on checkout_rooms to authenticated;
      grant select on app_notifications to authenticated;
      insert into profiles values ('${admin}','admin',true,null), ('${maintenance}','maintenance_staff',true,null),
        ('${otherWorker}','maintenance_staff',true,null);
      insert into blocks values (2,'B');
      insert into checkout_rooms values ('${room}',2,'803','TEST','second_inspection',null,null,null);
    `);
    await db.exec(readFileSync("supabase/migrations/20261116034935_checkout_inspection_assignment_notification.sql", "utf8"));

    const assign = () => db.query(`update checkout_rooms set inspection_notes=null, assigned_to=$1, status='rectification'
      where id=$2 and status='second_inspection'`, [maintenance, room]);
    await db.exec(`set role authenticated; set app.uid='${otherWorker}'`);
    await expect(assign()).rejects.toThrow("Only administrators");
    await db.exec(`reset role; alter table app_notifications add constraint fail_notification check (type <> 'checkout_assigned');
      set role authenticated; set app.uid='${admin}'`);
    await expect(assign()).rejects.toThrow("fail_notification");
    expect((await db.query("select status, assigned_to from checkout_rooms")).rows).toEqual([
      { status: "second_inspection", assigned_to: null },
    ]);

    await db.exec("reset role; alter table app_notifications drop constraint fail_notification; set role authenticated");
    await assign();
    await assign();
    await db.query("update checkout_rooms set inspection_notes='Revised inspection note' where id=$1", [room]);

    await db.exec(`set app.uid='${otherWorker}'`);
    expect((await db.query("select * from app_notifications")).rows).toEqual([]);
    await db.exec(`set app.uid='${maintenance}'`);
    expect((await db.query("select * from app_notifications")).rows).toEqual([{
      recipient_id: maintenance,
      type: "checkout_assigned",
      title: "New check-out room for rectification",
      body: "TEST · Block B · Room 803 was assigned to you after inspection.",
      href: `/staff/checkouts/${room}`,
      entity_id: room,
    }]);

    await db.exec(`set app.uid='${admin}'; update checkout_rooms set status='second_inspection', assigned_to=null;
      update checkout_rooms set assigned_to='${maintenance}', status='rectification'`);
    await db.exec("reset role");
    expect((await db.query("select * from app_notifications")).rows).toHaveLength(1);
  } finally {
    await db.close();
  }
}, 20000);
