// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { documentReviewers } from './document-review-status';

const [fikri, kevin, james] = documentReviewers;
const invoiceId = '00000000-0000-4000-8000-000000000001';
const secondInvoiceId = '00000000-0000-4000-8000-000000000002';
const migration = readFileSync('supabase/migrations/20261113050205_unifi_invoice_review.sql', 'utf8');
const archiveMigration = readFileSync('supabase/migrations/20261113062947_archive_historical_unifi_invoices.sql', 'utf8');

async function setupUnifiDatabase(db: PGlite) {
  await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema storage;
      create table storage.buckets(id text primary key, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[]);
      create table public.profiles(id uuid primary key, role text, is_active boolean, deleted_at timestamptz);
      create table public.app_notifications(id uuid primary key, recipient_id uuid,
        type text, title text, body text, href text, entity_id uuid);
      create table public.document_review_push_outbox(
        id uuid default gen_random_uuid() primary key,
        document_type text not null check(document_type in ('gym','billing','compliance')),
        document_id uuid not null, stage integer not null, recipient_id uuid not null,
        title text, body text, href text, delivered_at timestamptz, locked_until timestamptz,
        claim_token uuid, last_error text, unique(document_type, document_id, stage)
      );
      grant select on public.profiles to service_role;
      grant select, insert, update on public.document_review_push_outbox to service_role;
      grant insert on public.app_notifications to service_role;
      insert into public.profiles values
        ('${fikri.id}', 'admin', true, null), ('${kevin.id}', 'admin', true, null),
        ('${james.id}', 'admin', true, null);
      create function public.compliance_review_recipient(p_stage text) returns uuid language sql immutable as $$
        select case p_stage when 'fikri' then '${fikri.id}'::uuid
          when 'kevin' then '${kevin.id}'::uuid when 'james' then '${james.id}'::uuid end
      $$;
  `);
  await db.exec(migration);
}

it('restricts the TM Unifi archive and advances only the assigned reviewer, queuing each stage once', async () => {
  const db = new PGlite();
  try {
    await setupUnifiDatabase(db);
    expect((await db.query("select public, allowed_mime_types from storage.buckets where id = 'unifi-invoices'")).rows)
      .toEqual([{ public: false, allowed_mime_types: ['application/pdf'] }]);
    await db.exec('set role authenticated;');
    await expect(db.query('select * from public.unifi_invoices')).rejects.toThrow('permission denied');
    await expect(db.query("select public.advance_unifi_invoice_review($1, 'fikri', $2)", [invoiceId, fikri.id]))
      .rejects.toThrow('permission denied');
    await db.exec('reset role; set role service_role;');

    const insert = (id: string, period: string, number: string, hash: string) => db.query(
      `insert into public.unifi_invoices(id, period, source, invoice_number, file_name, content_hash, size_bytes)
       values ($1, $2, 'webmail', $3, 'Invoice.pdf', $4, 251)`, [id, period, number, hash.repeat(64)],
    );
    await insert(invoiceId, '2026-11', 'INV1', 'a');
    await expect(insert(secondInvoiceId, '2026-11', 'INV1', 'b')).rejects.toThrow('unique constraint');
    await expect(insert(secondInvoiceId, '2026-08', 'INV2', 'b')).rejects.toThrow('check constraint');
    await insert(secondInvoiceId, '2026-11', 'INV2', 'b');

    const review = (stage: string, actor: string) => db.query<{ stage: string }>(
      'select public.advance_unifi_invoice_review($1, $2, $3) as stage', [invoiceId, stage, actor],
    );
    const events = async () => (await db.query<{ id: string; recipient_id: string; href: string }>(
      'select id, recipient_id, href from public.document_review_push_outbox where document_id = $1 order by stage',
      [invoiceId],
    )).rows;
    const claim = (event: string) => db.query<{ claimed: boolean }>(
      'select public.claim_unifi_invoice_review_push($1, gen_random_uuid()) as claimed', [event],
    );
    expect((await events()).map(row => row.recipient_id)).toEqual([fikri.id]);
    await expect(review('fikri', kevin.id)).rejects.toThrow('assigned reviewer');
    await expect(review('james', james.id)).rejects.toThrow('stage has changed');
    expect((await review('fikri', fikri.id)).rows[0].stage).toBe('kevin');
    const [expired, current] = await events();
    expect((await claim(expired.id)).rows[0].claimed).toBe(false);
    expect((await claim(current.id)).rows[0].claimed).toBe(true);
    expect((await claim(current.id)).rows[0].claimed).toBe(false);
    expect((await review('kevin', kevin.id)).rows[0].stage).toBe('james');
    expect((await review('james', james.id)).rows[0].stage).toBe('approved');
    await expect(review('james', james.id)).rejects.toThrow('stage has changed');
    const finalEvents = await events();
    expect(finalEvents.map(row => row.recipient_id)).toEqual([fikri.id, kevin.id, james.id]);
    expect(finalEvents.every(row => row.href === '/admin/unifi-invoices/' + invoiceId)).toBe(true);
    await db.exec('reset role;');
    expect((await db.query('select * from public.app_notifications where entity_id = $1', [invoiceId])).rows).toHaveLength(3);
  } finally {
    await db.close();
  }
}, 20000);

it('archives unreviewed backfill invoices and clears their review notices while new invoices require review', async () => {
  const db = new PGlite();
  try {
    await setupUnifiDatabase(db);
    const sentBackfillId = invoiceId;
    const pendingBackfillId = secondInvoiceId;
    const freshInvoiceId = '00000000-0000-4000-8000-000000000003';
    const reviewedBackfillId = '00000000-0000-4000-8000-000000000004';
    const insert = (id: string, sourceMessageId: string, hash: string) => db.query(
      `insert into public.unifi_invoices(id, period, source, source_message_id, file_name, content_hash, size_bytes)
       values ($1, '2026-11', 'webmail', $2, 'Invoice.pdf', $3, 251)`, [id, sourceMessageId, hash.repeat(64)],
    );
    await insert(sentBackfillId, 'roundcube:inbox:1', 'a');
    await insert(pendingBackfillId, 'roundcube:inbox:2', 'b');
    await insert(freshInvoiceId, '<new@unifi.example>', 'c');
    await insert(reviewedBackfillId, 'roundcube:inbox:4', 'd');
    await db.query("select public.advance_unifi_invoice_review($1, 'fikri', $2)", [reviewedBackfillId, fikri.id]);
    await db.query("update public.document_review_push_outbox set delivered_at = '2026-11-13T03:00:00Z' where document_id = $1", [sentBackfillId]);
    await db.query("update public.document_review_push_outbox set claim_token = gen_random_uuid(), locked_until = now() where document_id = $1", [pendingBackfillId]);

    await db.exec(archiveMigration);
    expect((await db.query(`
      select id, review_stage, fikri_verified_at is not null as fikri_verified
      from public.unifi_invoices order by id
    `)).rows).toEqual([
      { id: sentBackfillId, review_stage: 'archived', fikri_verified: false },
      { id: pendingBackfillId, review_stage: 'archived', fikri_verified: false },
      { id: freshInvoiceId, review_stage: 'fikri', fikri_verified: false },
      { id: reviewedBackfillId, review_stage: 'kevin', fikri_verified: true },
    ]);
    expect((await db.query(`
      select entity_id from public.app_notifications order by entity_id
    `)).rows).toEqual([
      { entity_id: freshInvoiceId },
      { entity_id: reviewedBackfillId },
      { entity_id: reviewedBackfillId },
    ]);
    expect((await db.query(`
      select document_id, delivered_at is not null as retired,
        delivered_at = '2026-11-13T03:00:00Z' as sent,
        claim_token, locked_until, last_error
      from public.document_review_push_outbox where document_id in ($1, $2) order by document_id
    `, [sentBackfillId, pendingBackfillId])).rows).toEqual([
      { document_id: sentBackfillId, retired: true, sent: true, claim_token: null, locked_until: null, last_error: null },
      { document_id: pendingBackfillId, retired: true, sent: false, claim_token: null, locked_until: null, last_error: 'superseded' },
    ]);
    await expect(db.query("select public.advance_unifi_invoice_review($1, 'fikri', $2)", [sentBackfillId, fikri.id]))
      .rejects.toThrow('stage has changed');
    const laterInvoiceId = '00000000-0000-4000-8000-000000000005';
    await insert(laterInvoiceId, '<another-new@unifi.example>', 'e');
    expect((await db.query("select public.advance_unifi_invoice_review($1, 'fikri', $2) as stage", [laterInvoiceId, fikri.id])).rows)
      .toEqual([{ stage: 'kevin' }]);
  } finally {
    await db.close();
  }
}, 20000);
