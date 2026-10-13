// @vitest-environment node
// Disposable database: never writes hosted operational records.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("atomically limits the lifetime budget, denies staff, and records tokens", async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create table public.profiles(id uuid primary key,role text,is_active boolean,deleted_at timestamptz); insert into profiles values('00000000-0000-0000-0000-000000000001','admin',true,null),('00000000-0000-0000-0000-000000000002','cleaner',true,null);`);
  await db.exec(readFileSync("docs/AI_ASSISTANT_BUDGET.sql", "utf8"));
  await expect(db.query(`select public.klgcr_ai_reserve('00000000-0000-0000-0000-000000000002')`)).rejects.toThrow("Access denied");
  const first = await db.query<{ reservation: { id: string } }>(`select public.klgcr_ai_reserve('00000000-0000-0000-0000-000000000001') as reservation`);
  await expect(db.query(`select public.klgcr_ai_reserve('00000000-0000-0000-0000-000000000001')`)).rejects.toThrow("wait 10");
  await db.query(`select public.klgcr_ai_finish($1,100,20,120,'completed')`, [first.rows[0].reservation.id]);
  const tokens = await db.query<{ total_tokens: number }>(`select total_tokens from klgcr_ai.requests`); expect(tokens.rows[0].total_tokens).toBe(120);
  await db.exec(`update klgcr_ai.budget set reserved_myr=19.5; update klgcr_ai.requests set created_at=now()-interval '1 day';`);
  await db.query(`select public.klgcr_ai_reserve('00000000-0000-0000-0000-000000000001')`);
  await expect(db.query(`select public.klgcr_ai_reserve('00000000-0000-0000-0000-000000000001')`)).rejects.toThrow("RM20 budget reached");
  const privileges = await db.query<{ allowed: boolean }>(`select has_function_privilege('authenticated','public.klgcr_ai_reserve(uuid)','execute') as allowed`); expect(privileges.rows[0].allowed).toBe(false);
  await db.close();
}, 20000);
