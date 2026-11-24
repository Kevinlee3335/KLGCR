// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { documentReviewers } from './document-review-status';

const [fikri, kevin, james] = documentReviewers;
const signature = { strokes: [[[.1, .2], [.8, .7]]] };
const legacyId = '10000000-0000-4000-8000-000000000001';
let db: PGlite;
const migration = readFileSync('supabase/migrations/20261124074517_unifi_single_verifier_signatures.sql', 'utf8');
const review = (id: string, stage: string, actor: string) => db.query<{ stage: string }>(
  'select public.advance_signed_unifi_invoice_review($1,$2,$3,$4::jsonb) as stage', [id, stage, actor, JSON.stringify(signature)]);
const insert = (id: string) => db.query(`insert into public.unifi_invoices(id,period,source,file_name,content_hash,size_bytes)
  values($1::uuid,'2026-11','webmail','Invoice.pdf',replace(($1::uuid)::text,'-','')||replace(($1::uuid)::text,'-',''),100)`, [id]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table public.profiles(id uuid primary key,role text,is_active boolean,deleted_at timestamptz);
    create table public.user_e_signatures(user_id uuid primary key,signature jsonb,updated_at timestamptz default '2026-01-01');
    create table public.app_notifications(id uuid primary key,recipient_id uuid,type text,title text,body text,href text,entity_id uuid,read_at timestamptz);
    create table public.document_review_push_outbox(id uuid default gen_random_uuid() primary key,
      document_type text check(document_type in ('gym','billing','compliance')),document_id uuid,stage integer,recipient_id uuid,
      title text,body text,href text,delivered_at timestamptz,locked_until timestamptz,claim_token uuid,last_error text,
      unique(document_type,document_id,stage));
    grant select on public.profiles to service_role;
    grant select,insert,update on public.document_review_push_outbox,public.app_notifications to service_role;
    create function public.compliance_review_recipient(stage text) returns uuid language sql as $$select case stage
      when 'fikri' then '${fikri.id}'::uuid when 'kevin' then '${kevin.id}'::uuid when 'james' then '${james.id}'::uuid end$$;
    insert into public.profiles values('${fikri.id}','admin',true,null),('${kevin.id}','admin',true,null),('${james.id}','admin',true,null);
  `);
  await db.query('insert into public.user_e_signatures select id,$1::jsonb from public.profiles', [JSON.stringify(signature)]);
  for (const name of ['20261113050205_unifi_invoice_review','20261113063516_archive_historical_unifi_invoices','20261113070208_unifi_invoice_delivery'])
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, 'utf8'));
  // Apply the actual Unifi constraints and queue functions from the preceding
  // shared migration, without changing unrelated document workflows.
  const parallel = readFileSync('supabase/migrations/20261113071407_parallel_document_verification.sql', 'utf8');
  const first = parallel.indexOf('alter table public.unifi_invoices');
  await db.exec(parallel.slice(first, parallel.indexOf('--', first)));
  await db.exec(parallel.match(/alter table public\.unifi_invoices\n  add constraint[\s\S]*?\n  \);/)![0]);
  for (const name of ['document_review_pending_recipients', 'queue_pending_document_review', 'queue_unifi_invoice_review_push']) {
    const definition = parallel.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\$\\$;`));
    await db.exec(definition![0]);
  }
  await db.query(`insert into public.unifi_invoices(id,period,source,file_name,content_hash,size_bytes,review_stage,kevin_verified_at,kevin_verified_by)
    values($1,'2026-11','webmail','Existing.pdf',repeat('a',64),100,'fikri','2026-11-24T07:33:20Z',$2)`, [legacyId, kevin.id]);
  await db.exec(migration);
  await db.exec('set role service_role');
}, 20000);
afterAll(async () => { await db?.close(); });

it('preserves the existing Kevin verification and signature and forwards it to James', async () => {
  const row = (await db.query<{ review_stage: string; review_signatures: unknown; fikri_verified_at: null }>(
    'select review_stage,review_signatures,fikri_verified_at from public.unifi_invoices where id=$1', [legacyId])).rows[0];
  expect(row).toEqual({ review_stage: 'james', review_signatures: { kevin: signature }, fikri_verified_at: null });
  expect((await db.query('select recipient_id from public.app_notifications where entity_id=$1 and read_at is null', [legacyId])).rows)
    .toEqual([{ recipient_id: james.id }]);
  expect((await db.query('select invoice_id from public.unifi_invoice_delivery')).rows).toEqual([]);
});

it.each([['fikri', fikri], ['kevin', kevin]] as const)('accepts %s alone, snapshots signatures and queues Joey only after James approval', async (stage, actor) => {
  const id = crypto.randomUUID();
  await insert(id);
  await expect(review(id, 'james', james.id)).rejects.toThrow('stage has changed');
  await expect(review(id, stage, james.id)).rejects.toThrow('assigned reviewer');
  expect((await review(id, stage, actor.id)).rows[0].stage).toBe('james');
  expect((await db.query<{stage:string}>('select public.advance_signed_unifi_invoice_review($1,$2,$3,$4::jsonb) as stage',
    [id, stage, actor.id, JSON.stringify({ strokes: [[[0, 0], [1, 1]]] })])).rows[0].stage).toBe('james');
  const other = stage === 'fikri' ? kevin : fikri;
  await expect(review(id, stage === 'fikri' ? 'kevin' : 'fikri', other.id)).rejects.toThrow('stage has changed');
  expect((await db.query('select invoice_id from public.unifi_invoice_delivery where invoice_id=$1', [id])).rows).toEqual([]);
  expect((await review(id, 'james', james.id)).rows[0].stage).toBe('approved');
  expect((await review(id, 'james', james.id)).rows[0].stage).toBe('approved');
  const row = (await db.query<{ review_signatures: Record<string, unknown>; fikri_verified_at: string | null; kevin_verified_at: string | null }>(
    'select review_signatures,fikri_verified_at,kevin_verified_at from public.unifi_invoices where id=$1', [id])).rows[0];
  expect(row.review_signatures).toEqual({ [stage]: signature, james: signature });
  expect(stage === 'fikri' ? row.kevin_verified_at : row.fikri_verified_at).toBeNull();
  expect((await db.query('select status from public.unifi_invoice_delivery where invoice_id=$1', [id])).rows).toEqual([{ status: 'pending' }]);
});

it('requires a saved signature and keeps direct browser calls denied', async () => {
  const id = crypto.randomUUID();
  await insert(id);
  await expect(db.query('select public.advance_signed_unifi_invoice_review($1,$2,$3,null)', [id, 'kevin', kevin.id])).rejects.toThrow('E-signature');
  await expect(db.query('select * from public.user_e_signatures')).rejects.toThrow('permission denied');
  await expect(db.query('select public.advance_unifi_invoice_review($1,$2,$3)', [id, 'kevin', kevin.id])).rejects.toThrow('permission denied');
  await db.exec('reset role; set role authenticated');
  await expect(review(id, 'fikri', fikri.id)).rejects.toThrow('permission denied');
  await db.exec('reset role; set role service_role');
});
