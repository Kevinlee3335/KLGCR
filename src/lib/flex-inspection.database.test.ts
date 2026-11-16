// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("seals Flex data, detects competing saves and protects the completed inspection", async () => {
  const db = new PGlite();
  const inspector = "00000000-0000-4000-8000-000000000001";
  const signature = { strokes: [[[0, 0], [1, 1]]] };
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create table public.profiles(id uuid primary key);
      insert into public.profiles values ('${inspector}');
    `);
    await db.exec(readFileSync("supabase/migrations/20261116045750_flex_monthly_inspections.sql", "utf8"));
    await db.exec(`
      insert into public.flex_inspection_catalog values (1, '[{}]');
      insert into public.flex_inspection_report_templates values ('exit-sign', 'cGRm');
      set role authenticated;
    `);
    await expect(db.query("select * from public.flex_inspections")).rejects.toThrow("permission denied");
    await expect(db.query("select * from public.flex_inspection_catalog")).rejects.toThrow("permission denied");
    await expect(db.query("select * from public.flex_inspection_report_templates")).rejects.toThrow("permission denied");

    await db.exec("reset role; set role service_role;");
    expect((await db.query("select groups from public.flex_inspection_catalog")).rows).toHaveLength(1);
    expect((await db.query("select content_base64 from public.flex_inspection_report_templates")).rows).toHaveLength(1);
    await expect(db.query("update public.flex_inspection_catalog set groups = '[1]'::jsonb")).rejects.toThrow("permission denied");
    await expect(db.query("update public.flex_inspection_report_templates set content_base64 = 'Cg=='")).rejects.toThrow("permission denied");

    const createDraft = () => db.query(`insert into public.flex_inspections (period, inspection_date, updated_by, exceptions)
      values ('2026-11', '2026-11-15', $1, '{"unit-1":""}') returning revision`, [inspector]);
    expect((await createDraft()).rows).toEqual([{ revision: 1 }]);
    await expect(createDraft()).rejects.toThrow("duplicate key");
    const submit = (revision: number, remark: string) => db.query(`update public.flex_inspections set
      revision=revision+1, completed_at=now(), inspected_by=$2, inspected_by_name='Inspector',
      inspector_signature=$3, exceptions=jsonb_build_object('unit-1', $4::text)
      where period='2026-11' and revision=$1 and completed_at is null
      returning revision, inspected_by, inspector_signature, exceptions`, [revision, inspector, JSON.stringify(signature), remark]);
    expect((await submit(7, "Not working")).rows).toEqual([]);
    await expect(submit(1, " \t ")).rejects.toThrow("check constraint");
    expect((await submit(1, "Not working")).rows).toEqual([{
      revision: 2,
      inspected_by: inspector,
      inspector_signature: signature,
      exceptions: { "unit-1": "Not working" },
    }]);
    expect((await submit(2, "Attempt to rewrite")).rows).toEqual([]);
    await expect(db.query("update public.flex_inspections set revision=revision+1 where period='2026-11'"))
      .rejects.toThrow("completed Flex inspection cannot be changed");
    await expect(db.query("delete from public.flex_inspections where period='2026-11'")).rejects.toThrow("permission denied");
  } finally {
    await db.close();
  }
}, 20000);
