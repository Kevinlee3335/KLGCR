// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
const migration = readFileSync("supabase/migrations/20261012075557_notification_preferences_sync_health.sql", "utf8");
describe("sync transitions and settings authorization", () => {
  it("deduplicates failures, scopes recovery to the failed item, and restricts settings to admins", async () => {
    const db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
      create function public.is_admin() returns boolean language sql as $$ select current_setting('test.admin',true)='yes' $$;
      create table profiles(id uuid primary key,role text,is_active boolean,deleted_at timestamptz);
      create table app_notifications(id serial primary key,recipient_id uuid,type text,title text,body text,href text);
      insert into profiles values('00000000-0000-0000-0000-000000000001','admin',true,null),('00000000-0000-0000-0000-000000000002','maintenance_staff',true,null);
      grant usage on schema public,auth to authenticated,service_role; grant select on profiles to service_role; grant insert,select on app_notifications to service_role; grant usage,select on sequence app_notifications_id_seq to service_role;`);
    await db.exec(migration);
    const transition = (source: string, scope: string, failed: boolean) => db.query("select * from record_integration_sync($1,$2,$3,'Test status')", [source,scope,failed]);
    await db.exec("set role service_role");
    expect((await transition("inventory","item-A",false)).rows).toHaveLength(0);
    expect((await transition("inventory","item-A",true)).rows).toHaveLength(1);
    expect((await transition("inventory","item-A",true)).rows).toHaveLength(0);
    expect((await transition("inventory","item-B",false)).rows).toHaveLength(0);
    expect((await transition("inventory","item-A",false)).rows).toHaveLength(1);
    expect((await transition("inventory","item-A",false)).rows).toHaveLength(0);
    expect((await transition("google_form","form-1",true)).rows).toHaveLength(1);
    await db.exec("reset role; set role authenticated; set test.admin='no'; set test.actor='00000000-0000-0000-0000-000000000002'");
    await expect(db.exec("insert into phone_notification_preferences(user_id,updated_by) values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002')")).rejects.toThrow();
    await expect(transition("inventory","item-A",true)).rejects.toThrow();
    await db.exec("set test.admin='yes'; set test.actor='00000000-0000-0000-0000-000000000001'");
    await db.exec("insert into phone_notification_preferences(user_id,updated_by) values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001') on conflict(user_id) do update set enabled=false");
    expect((await db.query("select * from phone_notification_preferences")).rows).toHaveLength(1);
    await db.exec("update phone_notification_preferences set enabled=false");
    expect((await db.query<{enabled:boolean}>("select enabled from phone_notification_preferences")).rows[0].enabled).toBe(false);
    await db.close();
  });
});
