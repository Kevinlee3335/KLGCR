// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = id(1);
const viewer = id(2);
const rental = id(3);
const utility = id(4);
const james = 'eeab5f04-30c3-42bd-a095-58e56c814358';
const recipient = 'tenant@example.com';
const paidOn = '2020-01-01';

async function setup(db: PGlite) {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table profiles(id uuid primary key,role text,is_active boolean,deleted_at timestamptz);
    create table user_e_signatures(user_id uuid primary key,signature jsonb);
    create table billing_preview_runs(id uuid primary key,kind text,period text,snapshot jsonb);
    create table billing_run_approvals(run_id uuid primary key,approved_by_user uuid);
    create table memberships(id uuid primary key,full_name text,email text);
    create table membership_payments(id uuid primary key,member_id uuid,status text,kind text,reviewed_at timestamptz,reviewed_by uuid,period_start date,amount numeric,receipt_path text);
    create table membership_payment_ledger(payment_id uuid,receipt_no text,receipt_updated_at timestamptz);
    grant select on profiles,billing_preview_runs,billing_run_approvals to service_role;
    insert into profiles values('${admin}','admin',true,null),('${viewer}','management_viewer',true,null);
    insert into user_e_signatures values('${admin}','{"strokes":[[[0,0],[1,1]]]}');
    insert into billing_preview_runs values
      ('${rental}','rental','2026-09','{"lines":[{"accountId":"rental-1","name":"Synthetic Company","billNo":"RENT-001","amount":100}]}'),
      ('${utility}','utility','2026-10','{"lines":[{"name":"Synthetic Company","billNo":"UTIL-001","amount":100}]}');
    insert into billing_run_approvals values('${rental}','${james}'),('${utility}','${james}');
  `);
  for (const migration of [
    '20261029081238_unified_receipts_and_billing_payments',
    '20261030061427_official_receipt_five_digit_sequence',
    '20261102060100_receipt_signature_snapshot',
    '20261110090816_customer_invoice_packages',
    '20261110090839_payment_mail_admin_verification',
  ]) {
    await db.exec(readFileSync(`supabase/migrations/${migration}.sql`, 'utf8'));
  }
  await db.query(`insert into billing_payment_contacts values ('rental','rental-1',$1),('utility','legacy:'||md5('synthetic company'),$1)`, [recipient]);
  await db.query(`insert into billing_customer_invoice_packages
    (id,period,company_name,recipient,rental_run_id,rental_line_index,rental_account_key,rental_invoice_no,
      utility_run_id,utility_line_index,utility_account_key,file_name,page_count,created_by,confirmed_by,confirmed_at,status)
    values ($1,'2026-10','Synthetic Company',$2,$3,0,'rental-1','ACCOUNTS-RENT-001',$4,0,'legacy:'||md5('synthetic company'),'sample.pdf',2,$5,$5,now(),'sent')`,
  [id(5), recipient, rental, utility, admin]);
}

async function addProof(db: PGlite, message: number, proof: number, hashDigit: string) {
  const hash = hashDigit.repeat(64);
  await db.query(`insert into payment_mail_messages(id,gmail_message_id,sender_email,received_at,ingestion_completed_at)
    values($1,$2,'forwarder@example.com',now(),now()) on conflict (id) do nothing`, [id(message), message.toString(16)]);
  await db.query(`insert into payment_mail_attachments(id,message_id,gmail_part_id,filename,mime_type,size_bytes,content_hash,storage_path,status)
    values($1,$2,$3,'proof.pdf','application/pdf',100,$4,$5,'ready')`, [id(proof), id(message), String(proof), hash, `payment-mail/${id(message)}/${hash}.pdf`]);
}

it('issues one signed Receipt for approved invoices and rejects repeat proof or reference without changing balances', async () => {
  const db = new PGlite();
  const verify = (message: number, proof: number, overrides: {actor?: string; email?: string; amount?: number; reference?: string; confirmed?: boolean} = {}) =>
    db.query<{receipt: {id: string; kind: string; receipt_no: string; issuer_signature: unknown; email: string; amount: number; description: string}}>(
      'select to_jsonb(verify_payment_mail($1,$2,$3,$4,$5,$6,$7,$8,$9,true)) as receipt', [
        id(message), overrides.actor ?? admin, overrides.email ?? recipient, paidOn, overrides.amount ?? 70,
        overrides.reference ?? 'TEST-REF', id(proof), JSON.stringify([
          {run_id: rental, line_index: 0, amount: 30}, {run_id: utility, line_index: 0, amount: 40},
        ]), overrides.confirmed ?? true,
      ]);

  try {
    await setup(db);
    await addProof(db, 10, 11, 'a');
    await addProof(db, 10, 12, 'b');
    await addProof(db, 20, 21, 'a');
    await addProof(db, 30, 31, 'b');
    await db.exec('set role authenticated');
    await expect(db.query('select * from payment_mail_messages')).rejects.toThrow('permission denied');
    await expect(verify(10, 11)).rejects.toThrow('permission denied');

    await db.exec('set role service_role');
    await expect(verify(10, 11, {actor: viewer})).rejects.toThrow('Admin permission required');
    await expect(verify(10, 11, {confirmed: false})).rejects.toThrow('Confirm the bank payment');
    await expect(verify(10, 11, {email: 'forwarder@example.com'})).rejects.toThrow('confirmed registered email group');
    await expect(verify(10, 11, {amount: 69})).rejects.toThrow('must equal');
    expect((await db.query('select * from official_receipts')).rows).toHaveLength(0);
    expect((await db.query('select * from billing_payment_allocations')).rows).toHaveLength(0);

    const issued = (await verify(10, 11)).rows[0].receipt;
    expect(issued).toMatchObject({kind: 'billing', email: recipient, amount: 70, issuer_signature: {strokes: [[[0, 0], [1, 1]]]}});
    expect(issued.receipt_no).toMatch(/^KLGCR\/\d{2}00001$/);
    expect(issued.description).toContain('ACCOUNTS-RENT-001');
    expect(issued.description).toContain('UTIL-001');
    expect((await verify(10, 11)).rows[0].receipt).toEqual(issued);
    await expect(verify(20, 21)).rejects.toThrow('already belongs to a verified payment');
    await expect(verify(30, 31, {reference: 'Test ref'})).rejects.toThrow('A Receipt already exists');
    expect((await db.query('select * from official_receipts')).rows).toHaveLength(1);
    expect((await db.query('select * from billing_payment_allocations')).rows).toHaveLength(2);

    // A matching attachment that wasn't chosen as the original bank proof is not itself a duplicate payment.
    expect((await verify(30, 31, {reference: 'DIFFERENT-REF'})).rows[0].receipt.id).not.toBe(issued.id);
    await expect(db.query('select reject_payment_mail($1,$2,$3)', [id(10), admin, 'Duplicate'])).rejects.toThrow('cannot be rejected');
    const rejected = await db.query('select (reject_payment_mail($1,$2,$3)).status', [id(20), admin, 'Duplicate']);
    expect(rejected.rows).toEqual([{status: 'rejected'}]);
  } finally {
    await db.close();
  }
}, 20_000);
