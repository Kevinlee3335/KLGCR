// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { documentReviewerForStage } from "./document-review-status";

const { kevin, fikri, james } = documentReviewerForStage;
const inspectorId = "00000000-0000-4000-8000-000000000001";
const firstToken = "00000000-0000-4000-8000-000000000002";
const secondToken = "00000000-0000-4000-8000-000000000003";
const recipient = "fire-safety@flex.example";
const alternateRecipient = "different@flex.example";
const earlierMonth = "2026-10";
const currentMonth = "2026-11";
const draftMonth = "2026-12";

type Review = {
  kevin_verified_at: Date | null;
  fikri_verified_at: Date | null;
  status: string;
  recipient: string | null;
  claim_token: string | null;
  locked_until: Date | null;
  sent_at: Date | null;
};

async function setup(db: PGlite) {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.profiles (
      id uuid primary key,
      username text not null,
      role text not null,
      is_active boolean not null default true,
      deleted_at timestamptz
    );
    insert into public.profiles(id, username, role) values
      ('${kevin.id}', 'kevinlee3335', 'admin'),
      ('${fikri.id}', 'fikri', 'admin'),
      ('${james.id}', 'james', 'admin'),
      ('${inspectorId}', 'inspector', 'maintenance_staff');
    grant select on public.profiles to service_role;
    create function public.compliance_admin_username(p_actor_id uuid)
    returns text language sql stable security invoker set search_path = '' as $$
      select username from public.profiles
      where id = p_actor_id and role = 'admin' and is_active and deleted_at is null
    $$;
    create function public.compliance_review_recipient(p_stage text)
    returns uuid language sql immutable set search_path = '' as $$
      select case p_stage
        when 'kevin' then '${kevin.id}'::uuid
        when 'fikri' then '${fikri.id}'::uuid
        when 'james' then '${james.id}'::uuid
      end
    $$;
  `);
  for (const migration of [
    "20261116045750_flex_monthly_inspections.sql",
    "20261116074019_flex_inspection_verification.sql",
  ]) {
    await db.exec(readFileSync("supabase/migrations/" + migration, "utf8"));
  }
  await db.query(`
    insert into public.flex_inspections(period, inspection_date, updated_by, inspected_by, inspected_by_name, completed_at)
    values ($1, '2026-10-18', $4, $4, 'Inspector', now()), ($2, '2026-11-16', $4, $4, 'Inspector', now()),
      ($3, '2026-11-16', $4, null, null, null)
  `, [earlierMonth, currentMonth, draftMonth, inspectorId]);
}

it("verifies completed months in either order and exclusively claims mail after both reviewers", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    const verify = async (period: string, actorId: string) => (await db.query<Review>(
      "select * from public.record_flex_inspection_verification($1, $2)", [period, actorId],
    )).rows[0];
    const queue = async (actorId: string) => (await db.query<{ period: string }>(
      "select * from public.list_flex_inspections_awaiting_verification($1)", [actorId],
    )).rows.map(row => row.period);
    const claim = async (period: string, token: string, to = recipient) => (await db.query<Review>(
      "select * from public.claim_flex_inspection_mail($1, $2, $3)", [period, token, to],
    )).rows[0];

    await db.exec("set role authenticated;");
    await expect(db.query("select * from public.flex_inspection_mail_config")).rejects.toThrow("permission denied");
    await expect(db.query("select * from public.flex_inspection_reviews")).rejects.toThrow("permission denied");
    await expect(verify(currentMonth, kevin.id)).rejects.toThrow("permission denied");
    await expect(queue(fikri.id)).rejects.toThrow("permission denied");
    await expect(claim(currentMonth, firstToken)).rejects.toThrow("permission denied");
    await db.exec("reset role; set role service_role;");
    expect((await db.query("select id from public.flex_inspection_mail_config")).rows).toEqual([]);
    await expect(db.query("insert into public.flex_inspection_mail_config(recipients) values ('{}')")).rejects.toThrow("permission denied");

    expect(await queue(kevin.id)).toEqual([currentMonth, earlierMonth]);
    expect(await queue(fikri.id)).toEqual([currentMonth, earlierMonth]);
    expect(await queue(james.id)).toEqual([]);
    await expect(verify(currentMonth, james.id)).rejects.toThrow("Only Kevin or Fikri");
    await expect(verify(currentMonth, inspectorId)).rejects.toThrow("Only Kevin or Fikri");
    await expect(verify(draftMonth, kevin.id)).rejects.toThrow("Complete the Flex inspection");
    expect((await claim(currentMonth, firstToken))?.claim_token ?? null).toBeNull();

    const kevinFirst = await verify(currentMonth, kevin.id);
    expect(kevinFirst.kevin_verified_at).toBeInstanceOf(Date);
    expect(kevinFirst.fikri_verified_at).toBeNull();
    expect(await verify(currentMonth, kevin.id)).toEqual(kevinFirst);
    expect(await queue(kevin.id)).toEqual([earlierMonth]);
    expect(await queue(fikri.id)).toEqual([currentMonth, earlierMonth]);
    expect((await claim(currentMonth, firstToken))?.claim_token ?? null).toBeNull();

    const fikriFirst = await verify(earlierMonth, fikri.id);
    expect(fikriFirst.kevin_verified_at).toBeNull();
    expect(fikriFirst.fikri_verified_at).toBeInstanceOf(Date);
    expect(await queue(fikri.id)).toEqual([currentMonth]);
    expect(await verify(earlierMonth, kevin.id)).toMatchObject({
      fikri_verified_at: fikriFirst.fikri_verified_at,
      kevin_verified_at: expect.any(Date),
      status: "pending",
    });

    await db.exec("reset role;");
    await db.query("update public.profiles set is_active = false where id = $1", [fikri.id]);
    await db.exec("set role service_role;");
    expect(await queue(fikri.id)).toEqual([]);
    await expect(verify(currentMonth, fikri.id)).rejects.toThrow("Only Kevin or Fikri");
    await db.exec("reset role;");
    await db.query("update public.profiles set is_active = true where id = $1", [fikri.id]);
    await db.exec("set role service_role;");

    expect(await verify(currentMonth, fikri.id)).toMatchObject({
      kevin_verified_at: kevinFirst.kevin_verified_at,
      fikri_verified_at: expect.any(Date),
      status: "pending",
    });
    expect(await queue(kevin.id)).toEqual([]);
    expect(await queue(fikri.id)).toEqual([]);
    expect((await claim(currentMonth, firstToken, "one@flex.example,two@flex.example"))?.claim_token ?? null).toBeNull();
    const firstClaim = await claim(currentMonth, firstToken, " " + recipient + " ");
    expect(firstClaim).toMatchObject({ status: "sending", recipient, claim_token: firstToken, locked_until: expect.any(Date) });
    expect((await claim(currentMonth, secondToken))?.claim_token ?? null).toBeNull();

    await db.query("update public.flex_inspection_reviews set locked_until = now() - interval '1 second' where period = $1", [currentMonth]);
    expect((await claim(currentMonth, secondToken, alternateRecipient))?.claim_token ?? null).toBeNull();
    expect(await claim(currentMonth, secondToken)).toMatchObject({ status: "sending", recipient, claim_token: secondToken });
    await db.query(`
      update public.flex_inspection_reviews set status = 'uncertain', claim_token = null, locked_until = null
      where period = $1 and claim_token = $2
    `, [currentMonth, secondToken]);
    expect((await claim(currentMonth, firstToken, alternateRecipient))?.claim_token ?? null).toBeNull();
    expect(await claim(currentMonth, firstToken)).toMatchObject({ status: "sending", recipient, claim_token: firstToken });
    await db.query(`
      update public.flex_inspection_reviews set status = 'sent', sent_at = now(), claim_token = null, locked_until = null
      where period = $1 and claim_token = $2
    `, [currentMonth, firstToken]);
    expect((await claim(currentMonth, secondToken))?.claim_token ?? null).toBeNull();
    expect(await verify(currentMonth, kevin.id)).toMatchObject({ status: "sent", recipient, sent_at: expect.any(Date) });
  } finally {
    await db.close();
  }
}, 20000);
