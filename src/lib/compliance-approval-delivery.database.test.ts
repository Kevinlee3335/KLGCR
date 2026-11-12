// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('queues only approved supplier invoices or quotations, with management-only reads and service-only writes', async () => {
  const db = new PGlite();
  const invoice = '11111111-1111-4111-8111-111111111111';
  const quotation = '22222222-2222-4222-8222-222222222222';
  const report = '33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create function public.is_management() returns boolean language sql stable
        as $$ select coalesce(current_setting('test.management', true) = 'true', false) $$;
      create table public.compliance_cycle_documents (id uuid primary key, kind text not null, review_stage text not null);
      grant select, insert, update on public.compliance_cycle_documents to service_role;
    `);
    await db.exec(readFileSync('supabase/migrations/20261112080717_compliance_approval_delivery.sql', 'utf8'));
    await db.exec('set role service_role;');
    await db.query("insert into public.compliance_cycle_documents values ($1, 'invoice', 'fikri'), ($2, 'quotation', 'james'), ($3, 'service_report', 'kevin')", [invoice, quotation, report]);
    expect((await db.query('select * from public.compliance_document_delivery')).rows).toHaveLength(0);
    await db.query("update public.compliance_cycle_documents set review_stage='verified' where id=$1", [report]);
    await db.query("update public.compliance_cycle_documents set review_stage='approved' where id in ($1, $2)", [invoice, quotation]);
    await db.query("update public.compliance_cycle_documents set review_stage='approved' where id=$1", [invoice]);
    expect((await db.query('select document_id,status from public.compliance_document_delivery order by document_id')).rows)
      .toEqual([{ document_id: invoice, status: 'pending' }, { document_id: quotation, status: 'pending' }]);
    await db.query("update public.compliance_document_delivery set status='sending', attempted_at=now() where document_id=$1", [invoice]);
    await db.exec("reset role; set role authenticated; set test.management='false';");
    expect((await db.query('select * from public.compliance_document_delivery')).rows).toHaveLength(0);
    await db.exec("set test.management='true';");
    expect((await db.query('select * from public.compliance_document_delivery')).rows).toHaveLength(2);
    await expect(db.query("update public.compliance_document_delivery set status='sent'")).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
}, 20_000);
