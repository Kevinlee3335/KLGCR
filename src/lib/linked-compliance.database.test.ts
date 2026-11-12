// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const fikri = 'a21286a7-56fd-48e4-9571-ffeacf825692';
const kevin = '7a40e00f-2e95-4c27-83d9-0f7dba788b77';
const james = 'eeab5f04-30c3-42bd-a095-58e56c814358';
const worker = '11111111-1111-4111-8111-111111111111';
const legacy = '33333333-3333-4333-8333-333333333333';
const invoice = '44444444-4444-4444-8444-444444444444';
const oldestInvoiceEmail = '1234567890abcde1';
const newestInvoiceEmail = '1234567890abcde2';
const unrelatedEmail = '1234567890abcde3';
const hash = 'a'.repeat(64);

let db: PGlite;

async function saveRecord(values: Record<string, unknown>, id: string | null = null) {
  const { rows } = await db.query<{ id: string }>(
    'select public.save_compliance_record($1, $2, $3::jsonb) as id', [kevin, id, JSON.stringify(values)],
  );
  return rows[0].id;
}

async function openCycle(id: string) {
  const { rows } = await db.query<{ id: string; due_date: string | null; original_due_date: string | null }>(
    "select id, due_date::text, original_due_date::text from public.compliance_cycles where record_id = $1 and status = 'open'", [id],
  );
  return rows[0];
}

async function attachUpload(cycleId: string, kind: string) {
  const path = `${cycleId}/${hash}.pdf`;
  await db.exec('reset role');
  await db.query("insert into storage.objects(bucket_id,name) values('compliance-documents',$1)", [path]);
  await db.exec('set role service_role');
  const { rows } = await db.query<{ id: string }>(
    'select public.attach_compliance_document($1,$2,$3,null,$4,$5,$6,100) id',
    [kevin, cycleId, kind, path, `${kind}.pdf`, hash],
  );
  return rows[0].id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table public.profiles(id uuid primary key, username text, role text, is_active boolean default true, deleted_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid', true), '')::uuid$$;
    create function public.is_management() returns boolean language sql stable as $$select current_setting('test.management', true) = 'true'$$;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    create table public.app_notifications(id uuid primary key, recipient_id uuid, type text, title text, body text, href text, entity_id uuid);
    create table public.document_review_push_outbox(
      id uuid primary key default gen_random_uuid(), document_type text check (document_type in ('gym','billing')),
      document_id uuid, stage integer, recipient_id uuid, title text, body text, href text,
      delivered_at timestamptz, locked_until timestamptz, claim_token uuid, last_error text,
      unique(document_type,document_id,stage)
    );
    alter table storage.objects enable row level security;
    create table public.compliance_records(
      id uuid primary key default gen_random_uuid(), record_type text not null check(record_type in ('servicing','certificate_license')),
      title text not null, provider text, reference_no text, last_completed_date date, next_due_date date not null,
      status text not null default 'active' check(status in ('active','renewal_in_progress','expired','completed')),
      notes text, created_by uuid not null references public.profiles(id), created_at timestamptz default now(), updated_at timestamptz default now(),
      frequency text, contact_name text, contact_phone text, contact_email text
    );
    alter table public.compliance_records enable row level security;
    grant usage on schema auth, storage to authenticated, service_role;
    grant select on public.profiles to service_role;
    grant select, insert, update on public.app_notifications, public.document_review_push_outbox to service_role;
    grant all on public.compliance_records to authenticated;
    grant select on storage.objects to authenticated, service_role;
    create policy management_read on public.compliance_records for select to authenticated using(public.is_management());
    create policy legacy_write on public.compliance_records for update to authenticated using(true) with check(true);
    insert into public.profiles(id,username,role) values
      ('${fikri}','fikri','admin'), ('${kevin}','kevinlee3335','admin'), ('${james}','james','admin'), ('${worker}','staff','staff');
    insert into public.compliance_records(id,record_type,title,provider,last_completed_date,next_due_date,created_by)
      values ('${legacy}','certificate_license','Legacy certificate','Supplier','2024-12-01','2025-12-01','${kevin}');
  `);
  for (const migration of [
    '20261027051233_supplier_mail_archive',
    '20261112075230_supplier_mail_sender_registry',
    '20261112092258_linked_compliance_cycles',
    '20261112092305_compliance_document_review_alerts',
  ]) await db.exec(readFileSync(`supabase/migrations/${migration}.sql`, 'utf8'));
  await db.exec(`
    insert into public.supplier_mail_documents(id,company,content_hash,file_name,folder,storage_path,size_bytes)
      values('${invoice}','sigma',repeat('b',64),'Invoice.pdf','Invoice','sigma/invoice.pdf',100);
    insert into public.supplier_emails(id,company,sender,subject,received_at) values
      ('${oldestInvoiceEmail}','sigma','first@sigmamy.com','Invoice','2025-11-15T09:00:00+08'),
      ('${newestInvoiceEmail}','sigma','second@sigmamy.com','Invoice','2025-11-15T11:00:00+08'),
      ('${unrelatedEmail}','mfe','mfetsb@gmail.com','Other email','2025-11-15T12:00:00+08');
    insert into public.supplier_mail_attachments(message_id,part_id,file_name,document_id) values
      ('${oldestInvoiceEmail}','1','Invoice.pdf','${invoice}'),
      ('${newestInvoiceEmail}','1','Invoice.pdf','${invoice}');
    set role service_role;
  `);
}, 20_000);

afterAll(async () => { await db?.close(); });

describe('linked compliance renewal', () => {
  it('preserves the old record and due date while keeping direct browser writes and staff reads private', async () => {
    expect(await openCycle(legacy)).toMatchObject({ due_date: '2025-12-01', original_due_date: '2025-12-01' });
    expect((await db.query('select last_completed_date::text,required_evidence from public.compliance_records where id = $1', [legacy])).rows[0])
      .toEqual({ last_completed_date: '2024-12-01', required_evidence: ['certificate'] });

    await db.exec("reset role; set role authenticated; set test.management = 'false'");
    try {
      expect((await db.query('select * from public.compliance_cycles')).rows).toHaveLength(0);
      expect((await db.query('select * from public.compliance_cycle_documents')).rows).toHaveLength(0);
      await db.exec("set test.management = 'true'");
      expect((await db.query('select * from public.compliance_cycles')).rows).toHaveLength(1);
      await expect(db.query("update public.compliance_records set status = 'completed' where id = $1", [legacy])).rejects.toThrow('permission denied');
      await expect(db.query('select public.complete_compliance_cycle($1,$2,null,null,null,null)', [kevin, (await openCycle(legacy)).id])).rejects.toThrow('permission denied');
    } finally { await db.exec('reset role; set role service_role'); }
  });

  it('keeps actual return date, exact email evidence and approved invoice together through renewal', async () => {
    const id = await saveRecord({ record_type: 'certificate_license', title: 'Block D extinguishers', next_due_date: '2025-10-27',
      supplier_key: 'sigma', required_evidence: ['invoice', 'certificate'] });
    const cycle = await openCycle(id);
    await saveRecord({ next_due_date: '2025-10-28' }, id);
    expect(await openCycle(id)).toMatchObject({ id: cycle.id, original_due_date: '2025-10-27', due_date: '2025-10-28' });

    await db.query('select public.update_compliance_cycle_progress($1,$2,$3,$4)', [kevin, cycle.id, '2025-11-15', 'Returned by supplier']);
    const complete = () => db.query<{ next: string }>('select public.complete_compliance_cycle($1,$2,null,$3,null,null) next', [kevin, cycle.id, '2026-10-28']);
    await expect(complete()).rejects.toThrow('certificate, invoice');
    const attachMail = (source: string) => db.query<{ id: string }>(
      "select public.attach_compliance_document($1,$2,'invoice',$3,null,null,null,null,$4) id", [kevin, cycle.id, invoice, source],
    );
    await expect(attachMail(unrelatedEmail)).rejects.toThrow('Original supplier email not found');
    const attachment = (await attachMail(oldestInvoiceEmail)).rows[0].id;
    expect((await attachMail(newestInvoiceEmail)).rows[0].id).toBe(attachment);
    expect((await db.query('select source,source_message_id,storage_path from public.compliance_cycle_documents where id = $1', [attachment])).rows[0])
      .toEqual({ source: 'supplier_email', source_message_id: oldestInvoiceEmail, storage_path: 'sigma/invoice.pdf' });
    const firstAlert = (await db.query<{ id: string }>('select id from public.app_notifications where entity_id = $1', [attachment])).rows[0];
    expect((await db.query('select recipient_id,href from public.app_notifications where id = $1', [firstAlert.id])).rows[0])
      .toEqual({ recipient_id: fikri, href: '/admin/cert-servicing/records/' + id + '?focusCycle=' + cycle.id + '#document-' + attachment });

    await attachUpload(cycle.id, 'certificate');
    await expect(complete()).rejects.toThrow('invoice');
    const advance = (actor: string, stage: string) => db.query<{ stage: string }>('select public.advance_compliance_document_review($1,$2,$3) stage', [actor, attachment, stage]);
    await expect(advance(james, 'fikri')).rejects.toThrow('another reviewer');
    expect((await advance(fikri, 'fikri')).rows[0].stage).toBe('kevin');
    expect((await db.query('select public.claim_compliance_review_push($1,gen_random_uuid()) as claimed', [firstAlert.id])).rows[0])
      .toEqual({ claimed: false });
    await expect(advance(fikri, 'fikri')).rejects.toThrow('stage has changed');
    expect((await advance(kevin, 'kevin')).rows[0].stage).toBe('james');
    expect((await advance(james, 'james')).rows[0].stage).toBe('approved');
    expect((await db.query('select recipient_id from public.document_review_push_outbox where document_id = $1 order by stage', [attachment])).rows)
      .toEqual([fikri, kevin, james].map(recipient_id => ({ recipient_id })));

    const next = (await complete()).rows[0].next;
    expect(await openCycle(id)).toMatchObject({ id: next, due_date: '2026-10-28' });
    expect((await db.query('select status,performed_on::text,due_date::text,next_due_date::text,notes,required_evidence from public.compliance_cycles where id = $1', [cycle.id])).rows[0])
      .toEqual({ status: 'completed', performed_on: '2025-11-15', due_date: '2025-10-28', next_due_date: '2026-10-28', notes: 'Returned by supplier', required_evidence: ['certificate','invoice'] });
    await expect(complete()).rejects.toThrow('already completed');
    await expect(attachMail(oldestInvoiceEmail)).rejects.toThrow('closed');
  });

  it('requires a signed agreement and accepts a service report after the two verifications only', async () => {
    await expect(saveRecord({ record_type: 'agreement', title: 'Contract', required_evidence: [] })).rejects.toThrow('signed agreement');
    const agreement = await saveRecord({ record_type: 'agreement', title: 'Contract' });
    const contract = await openCycle(agreement);
    expect(contract.due_date).toBeNull();
    const complete = (cycle: string) => db.query('select public.complete_compliance_cycle($1,$2,$3,null,null,null)', [kevin, cycle, '2025-11-01']);
    await expect(complete(contract.id)).rejects.toThrow('agreement');
    await expect(db.query("select public.attach_compliance_document($1,$2,'agreement',null,$3,'signed.pdf',$4,100)",
      [kevin, contract.id, `${contract.id}/${hash}.pdf`, hash])).rejects.toThrow('Upload a valid PDF');
    await attachUpload(contract.id, 'agreement');
    await complete(contract.id);
    expect(await openCycle(agreement)).toBeUndefined();

    const service = await saveRecord({ record_type: 'servicing', title: 'Lift service', supplier_key: 'sigma' });
    const cycle = await openCycle(service);
    const report = await attachUpload(cycle.id, 'service_report');
    await expect(complete(cycle.id)).rejects.toThrow('service_report');
    await expect(db.query("select public.advance_compliance_document_review($1,$2,'fikri')", [worker, report])).rejects.toThrow('Admin account required');
    await db.query("select public.advance_compliance_document_review($1,$2,'fikri')", [fikri, report]);
    expect((await db.query<{ stage: string }>("select public.advance_compliance_document_review($1,$2,'kevin') stage", [kevin, report])).rows[0].stage).toBe('verified');
    await expect(db.query("select public.advance_compliance_document_review($1,$2,'james')", [james, report])).rejects.toThrow('stage has changed');
    await complete(cycle.id);
  });

  it('requires an invoice for a billed service cycle without changing the next cycle requirements', async () => {
    const service = await saveRecord({ record_type: 'servicing', title: 'Billed lift repair', supplier_key: 'sigma' });
    const cycle = await openCycle(service);
    const report = await attachUpload(cycle.id, 'service_report');
    const advance = (actor: string, document: string, stage: string) => db.query(
      'select public.advance_compliance_document_review($1,$2,$3)', [actor, document, stage],
    );
    await advance(fikri, report, 'fikri');
    await advance(kevin, report, 'kevin');
    await db.query('select public.update_compliance_cycle_progress($1,$2,$3,$4,true)', [kevin, cycle.id, '2025-11-01', 'Billed repair']);

    const complete = () => db.query<{ next: string }>(
      "select public.complete_compliance_cycle($1,$2,null,'2026-11-01',null,null) next", [kevin, cycle.id],
    );
    await expect(complete()).rejects.toThrow('Required documents are missing or awaiting review: invoice');
    expect((await openCycle(service)).id).toBe(cycle.id);

    const attached = (await db.query<{ id: string }>(
      "select public.attach_compliance_document($1,$2,'invoice',$3,null,null,null,null) id", [kevin, cycle.id, invoice],
    )).rows[0].id;
    await advance(fikri, attached, 'fikri');
    await advance(kevin, attached, 'kevin');
    await advance(james, attached, 'james');
    const next = (await complete()).rows[0].next;
    expect((await db.query('select requires_invoice,required_evidence from public.compliance_cycles where id = $1', [cycle.id])).rows[0])
      .toEqual({ requires_invoice: true, required_evidence: ['service_report','invoice'] });
    expect((await db.query('select requires_invoice,required_evidence from public.compliance_cycles where id = $1', [next])).rows[0])
      .toEqual({ requires_invoice: false, required_evidence: null });
    expect((await db.query('select required_evidence from public.compliance_records where id = $1', [service])).rows[0])
      .toEqual({ required_evidence: ['service_report'] });
  });
});
