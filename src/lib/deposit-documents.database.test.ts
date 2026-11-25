// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261125065415_gym_deposit_documents.sql', 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const kevin = id(1), fikri = id(2), unsigned = id(3), patrol = id(4), inactive = id(5), removed = id(6);
const memberA = id(10), memberB = id(11), resident = id(12), memberC = id(13);
const signature = { strokes: [[[0.1, 0.2], [0.6, 0.8]]] };
const secondSignature = { strokes: [[[0.2, 0.1], [0.8, 0.6]]] };
type Receipt = { id: string; receipt_no: string; status: string; received_by_name: string; issuer_signature: unknown; email_status: string; origin: string; amount: number | string };
type Voucher = { id: string; voucher_no: string; refunded_by: string; refunded_by_name: string; refund_signature: unknown; amount: number | string };

describe('atomic Gym deposit documents', () => {
  let db: PGlite;
  let today: string;
  let year: number;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table public.profiles(id uuid primary key,full_name text,role text,is_active boolean,deleted_at timestamptz);
      create table public.memberships(id uuid primary key,full_name text,email text,member_type text,member_number text,room_no text);
      create table public.user_e_signatures(user_id uuid primary key references profiles(id),signature jsonb);
      create table public.membership_activity(id uuid primary key default gen_random_uuid(),member_id uuid,event text,actor_id uuid,details jsonb,created_at timestamptz default now());
      create table public.membership_payment_ledger(
        id uuid primary key,source text,collected_on date,full_name text,member_type text,
        member_reference text,receipt_no text,amount numeric(12,2),kind text,created_by uuid,
        deleted_at timestamptz,deleted_by uuid,
        check(source <> 'manual' or (kind = 'access_card_deposit' and amount = 10 and created_by is not null))
      );
      grant all on public.profiles,public.memberships,public.membership_activity,public.membership_payment_ledger to service_role;
      insert into public.profiles values
        ('${kevin}','KEVIN LEE','admin',true,null),('${fikri}','FIKRI','admin',true,null),
        ('${unsigned}','UNSIGNED STAFF','admin',true,null),('${patrol}','GYM PATROL','gym_patrol',true,null),
        ('${inactive}','INACTIVE','admin',false,null),('${removed}','REMOVED','admin',true,now());
      insert into public.memberships values
        ('${memberA}','Member A','a@example.com','outsider','GYM-A',''),
        ('${memberB}','Member B','b@example.com','outsider','GYM-B',''),
        ('${resident}','Existing Resident','resident@example.com','resident',null,'A101'),
        ('${memberC}','Member C','c@example.com','outsider','GYM-C','');
    `);
    await db.query('insert into user_e_signatures values ($1,$2),($3,$4)', [kevin, JSON.stringify(signature), fikri, JSON.stringify(secondSignature)]);
    // Production deliberately lacks a service-role signature SELECT grant;
    // the new migration must provide it rather than relying on BYPASSRLS.
    expect((await db.query<{allowed:boolean}>("select has_table_privilege('service_role','public.user_e_signatures','SELECT') as allowed")).rows[0].allowed).toBe(false);
    await db.exec(migration);
    const clock = (await db.query<{ today: string; issue_year: number }>("select to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYY-MM-DD') as today,extract(year from now() at time zone 'Asia/Kuala_Lumpur')::int as issue_year")).rows[0];
    today = clock.today; year = clock.issue_year;
  });
  afterEach(async () => { await db.close(); });

  async function receive(request: number, member = memberA, actor = kevin, origin = 'received', original = '', date?: string) {
    return (await db.query<{ receipt: Receipt }>(
      'select to_jsonb(record_gym_deposit($1,$2,$3,$4,$5,$6,$7)) receipt',
      [id(request), member, actor, date || today, origin, original, '']
    )).rows[0].receipt;
  }
  async function refund(request: number, deposit: number, actor = kevin) {
    return (await db.query<{ voucher: Voucher }>('select to_jsonb(refund_gym_deposit($1,$2,$3)) voucher', [id(request), id(deposit), actor])).rows[0].voucher;
  }
  async function next(kind: string, counterYear = year) {
    return (await db.query<{ number: string }>('select next_financial_document_number($1,$2) number', [kind, counterYear])).rows[0].number;
  }
  async function count(table: string) {
    return (await db.query<{ count: number }>(`select count(*)::int count from ${table}`)).rows[0].count;
  }

  it('shares annual document counters, retries once and preserves a single separate cash ledger entry', async () => {
    const receipt = await receive(20);
    expect(receipt.receipt_no).toBe(`KLGDR-${String(year).slice(-2)}00001`);
    expect(receipt.received_by_name).toBe('KEVIN LEE');
    expect(receipt.issuer_signature).toEqual(signature);
    expect(await receive(20)).toEqual(receipt);
    await expect(receive(21)).rejects.toThrow('already held');
    await expect(receive(20, memberB)).rejects.toThrow('identifier already used');
    await expect(receive(22, resident)).rejects.toThrow('Non Residence');
    expect(await next('deposit_receipt')).toBe(`KLGDR-${String(year).slice(-2)}00002`);
    expect((await receive(23, memberB)).receipt_no).toBe(`KLGDR-${String(year).slice(-2)}00003`);
    expect(await next('deposit_receipt', year + 1)).toBe(`KLGDR-${String(year + 1).slice(-2)}00001`);
    expect(await next('payment_voucher', year + 1)).toBe(`KLGPV-${String(year + 1).slice(-2)}00001`);
    await expect(next('unknown')).rejects.toThrow('Invalid');
    const ledger = (await db.query<{ amount: string; kind: string; member_type: string; receipt_no: string }>('select amount,kind,member_type,receipt_no from membership_payment_ledger where id=$1', [id(20)])).rows[0];
    expect(ledger).toEqual({ amount: '10.00', kind: 'access_card_deposit', member_type: 'outsider', receipt_no: receipt.receipt_no });
    expect(await count('membership_payment_ledger')).toBe(2);
    await expect(db.query('update membership_payment_ledger set deleted_at=now() where id=$1', [id(20)])).rejects.toThrow('cannot be changed');
    await expect(db.query('update membership_payment_ledger set receipt_no=$2 where id=$1', [id(20), 'other'])).rejects.toThrow('cannot be changed');
  });

  it('captures the actual refund employee signature and never refunds a receipt twice', async () => {
    await receive(20);
    await expect(refund(30, 20, unsigned)).rejects.toThrow('e-signature');
    expect(await count('payment_vouchers')).toBe(0);
    const voucher = await refund(30, 20, fikri);
    expect(voucher.voucher_no).toBe(`KLGPV-${String(year).slice(-2)}00001`);
    expect(voucher.refunded_by).toBe(fikri);
    expect(voucher.refunded_by_name).toBe('FIKRI');
    expect(voucher.refund_signature).toEqual(secondSignature);
    expect(await refund(31, 20, kevin)).toEqual(voucher);
    await db.query('update profiles set full_name=$2 where id=$1', [fikri, 'Changed staff name']);
    await db.query('update user_e_signatures set signature=$2 where user_id=$1', [fikri, JSON.stringify(signature)]);
    expect(await refund(30, 20, fikri)).toEqual(voucher);
    expect((await db.query<{ status: string }>('select status from deposit_receipts where id=$1', [id(20)])).rows[0].status).toBe('refunded');
    expect(await count('payment_vouchers')).toBe(1);
    expect((await db.query<{ summary: unknown }>('select get_deposit_document_summary() summary')).rows[0].summary).toEqual({ receivedAmount: 10, openingAmount: 0, refundedAmount: 10, heldAmount: 0, heldCount: 0 });
    await expect(db.query('update payment_vouchers set refunded_by_name=$2 where id=$1', [id(30), 'Kevin'])).rejects.toThrow('cannot be changed');
    await expect(db.query('update deposit_receipts set amount=20 where id=$1', [id(20)])).rejects.toThrow('cannot be changed');
    await expect(db.query("update deposit_receipts set status='held' where id=$1", [id(20)])).rejects.toThrow('signed deposit refund');
    await expect(db.query('delete from payment_vouchers where id=$1', [id(30)])).rejects.toThrow('cannot be deleted');
    await db.query("update payment_vouchers set email_status='failed',email_error='gateway busy',pdf_path='vouchers/sample.pdf' where id=$1", [id(30)]);
    expect((await db.query<{ amount: string; refunded_by_name: string }>('select amount,refunded_by_name from payment_vouchers where id=$1', [id(30)])).rows[0]).toEqual({ amount: '10.00', refunded_by_name: 'FIKRI' });
    await expect(db.query("update payment_vouchers set pdf_path='other.pdf' where id=$1", [id(30)])).rejects.toThrow('cannot be replaced');
    expect((await receive(21)).status).toBe('held');
  });

  it('records old cash as an opening deposit without new cash or email and reserves old numbered receipts', async () => {
    const opening = await receive(20, resident, kevin, 'existing', 'HANDWRITTEN-0042', `${year - 1}-10-01`);
    expect(opening.receipt_no).toBe('HANDWRITTEN-0042');
    expect(opening.email_status).toBe('not_required');
    expect(await count('membership_payment_ledger')).toBe(0);
    await expect(receive(21, memberA, kevin, 'existing', 'handwritten-0042', `${year - 1}-10-01`)).rejects.toThrow('already recorded');
    await expect(receive(22, memberA, kevin, 'existing', '')).rejects.toThrow('receipt number');
    await expect(receive(23, memberA, kevin, 'received', '', `${year - 1}-10-01`)).rejects.toThrow('current year');
    const numbered = `klgdr-${String(year).slice(-2)}00005`;
    const importedNumbered = await receive(24, memberA, kevin, 'existing', numbered, `${year - 1}-10-01`);
    expect(importedNumbered.receipt_no).toBe(numbered);
    await expect(receive(26, memberC, kevin, 'existing', numbered.toUpperCase(), `${year - 1}-10-01`)).rejects.toThrow('already recorded');
    expect((await receive(25, memberB)).receipt_no).toBe(`KLGDR-${String(year).slice(-2)}00006`);
    expect(await count('membership_payment_ledger')).toBe(1);
    const oldRefund = await refund(30, 20);
    expect(oldRefund.amount).toBe(10);
    expect((await db.query<{ summary: unknown }>('select get_deposit_document_summary() summary')).rows[0].summary).toEqual({ receivedAmount: 10, openingAmount: 20, refundedAmount: 10, heldAmount: 20, heldCount: 2 });
  });

  it('rejects unauthorized and inactive actors and denies direct browser access to data and RPCs', async () => {
    for (const actor of [patrol, inactive, removed]) await expect(receive(20, memberA, actor)).rejects.toThrow('Admin permission');
    await receive(20);
    await expect(refund(30, 20, patrol)).rejects.toThrow('Admin permission');
    expect((await db.query<{ ok: boolean }>('select financial_signature_valid($1) ok', [JSON.stringify({ strokes: [] })])).rows[0].ok).toBe(false);
    expect((await db.query<{ ok: boolean }>('select financial_signature_valid($1) ok', [JSON.stringify({ strokes: [[[0, 0], [2, 1]]] })])).rows[0].ok).toBe(false);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await expect(db.query('select * from deposit_receipts')).rejects.toThrow('permission denied');
      await expect(db.query('select * from payment_vouchers')).rejects.toThrow('permission denied');
      await expect(next('deposit_receipt')).rejects.toThrow('permission denied');
      await expect(refund(30, 20)).rejects.toThrow('permission denied');
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    expect((await db.query<{signature:unknown}>('select signature from public.user_e_signatures where user_id=$1', [kevin])).rows[0].signature).toEqual(signature);
    expect((await receive(21, memberB)).status).toBe('held');
    expect((await refund(30, 20)).refunded_by).toBe(kevin);
    await db.exec('reset role');
    expect((await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('deposit_receipts','payment_vouchers','financial_document_counters')")).rows.every(row => row.relrowsecurity)).toBe(true);
  });

  it('resolves competing collect and refund requests to one transaction and one document number', async () => {
    const collections = await Promise.allSettled([receive(20), receive(21)]);
    expect(collections.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await count('deposit_receipts')).toBe(1);
    expect(await count('membership_payment_ledger')).toBe(1);
    const successful = collections.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<Receipt>;
    const depositId = successful.value.id === id(20) ? 20 : 21;
    const refunds = await Promise.all([refund(30, depositId), refund(31, depositId)]);
    expect(refunds[0]).toEqual(refunds[1]);
    expect(await count('payment_vouchers')).toBe(1);
    expect((await db.query<{ last_value: number }>('select last_value from financial_document_counters')).rows.every(row => row.last_value === 1)).toBe(true);
    expect(await count('membership_activity')).toBe(2);
  });
});
