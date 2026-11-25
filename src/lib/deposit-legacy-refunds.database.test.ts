// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const baseMigration = readFileSync('supabase/migrations/20261125065415_gym_deposit_documents.sql', 'utf8');
const migration = readFileSync('supabase/migrations/20261125075730_gym_legacy_deposit_refunds.sql', 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const kevin = id(1), fikri = id(2), unsigned = id(3), patrol = id(4), inactive = id(5);
const memberA = id(10), memberB = id(11), resident = id(12), memberC = id(13);
const signature = { strokes: [[[0.1, 0.2], [0.6, 0.8]]] };
const secondSignature = { strokes: [[[0.2, 0.1], [0.8, 0.6]]] };
type Voucher = {
  id: string; voucher_no: string; member_id: string; origin: string; deposit_receipt_id: string | null;
  refunded_by: string; refunded_by_name: string; refund_signature: unknown; payer: string; email: string;
  member_reference: string; amount: number; paid_on: string;
};

describe('direct handwritten Gym deposit refunds', () => {
  let db: PGlite;
  let today: string;
  let year: number;
  let collectionDay: string;
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
      create table public.membership_activity(id uuid primary key default gen_random_uuid(),member_id uuid,event text,actor_id uuid,details jsonb);
      create table public.membership_payment_ledger(id uuid primary key,source text,collected_on date,full_name text,member_type text,
        member_reference text,receipt_no text,amount numeric(12,2),kind text,created_by uuid,deleted_at timestamptz,deleted_by uuid);
      grant all on public.profiles,public.memberships,public.membership_activity,public.membership_payment_ledger to service_role;
      insert into public.profiles values
        ('${kevin}','KEVIN LEE','admin',true,null),('${fikri}','FIKRI','admin',true,null),
        ('${unsigned}','UNSIGNED STAFF','admin',true,null),('${patrol}','GYM PATROL','gym_patrol',true,null),
        ('${inactive}','INACTIVE','admin',false,null);
      insert into public.memberships values
        ('${memberA}','Member A','a@example.com','outsider','GYM-A',''),
        ('${memberB}','Member B','b@example.com','outsider','GYM-B',''),
        ('${resident}','Old Resident','resident@example.com','resident',null,'A101'),
        ('${memberC}','Member C','c@example.com','outsider','GYM-C','');
    `);
    await db.query('insert into user_e_signatures values ($1,$2),($3,$4)', [kevin, JSON.stringify(signature), fikri, JSON.stringify(secondSignature)]);
    await db.exec(baseMigration);
    today = (await db.query<{ calendar_day: string }>("select to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYY-MM-DD') as calendar_day")).rows[0].calendar_day;
    year = Number(today.slice(0, 4));
    collectionDay = today < '2026-12-01' ? '2026-12-01' : today;
  });
  afterEach(async () => { await db.close(); });

  async function legacy(request: number, member = memberA, actor = kevin) {
    return (await db.query<{ voucher: Voucher }>('select to_jsonb(refund_legacy_gym_deposit($1,$2,$3)) voucher', [id(request), member, actor])).rows[0].voucher;
  }
  async function receive(request: number, member = memberA, origin = 'received', date = collectionDay, original = '') {
    return (await db.query<{ receipt: { id: string; status: string; receipt_no: string } }>(
      'select to_jsonb(record_gym_deposit($1,$2,$3,$4,$5,$6,$7)) receipt', [id(request), member, kevin, date, origin, original, '']
    )).rows[0].receipt;
  }
  async function refund(request: number, deposit: number, actor = kevin) {
    return (await db.query<{ voucher: Voucher }>('select to_jsonb(refund_gym_deposit($1,$2,$3)) voucher', [id(request), id(deposit), actor])).rows[0].voucher;
  }
  async function count(table: string) {
    return (await db.query<{ count: number }>(`select count(*)::int count from ${table}`)).rows[0].count;
  }
  async function enableIsolatedCollectionClock() {
    // Only this in-memory fixture replaces the no-argument server clock helper.
    // Production has no parameter, configuration flag or caller-controlled bypass.
    await db.exec(`create or replace function public.assert_gym_deposits_started() returns date
      language sql stable security invoker set search_path = '' as $$ select date '${collectionDay}' $$;`);
  }

  it('upgrades populated vouchers without changing issued facts or weakening immutability', async () => {
    await receive(20, resident, 'existing', '2020-01-01', 'OLD-PAPER-42');
    const old = await refund(30, 20, fikri);
    await db.query(`insert into deposit_receipts(id,receipt_no,source_module,member_id,payer,amount,received_on,
      received_by,received_by_name,origin,status) values($1,'OTHER-42','other',null,'Other payee',50,$2,$3,'KEVIN LEE','received','refunded')`, [id(40), today, kevin]);
    await db.query(`insert into payment_vouchers(id,voucher_no,source_module,deposit_receipt_id,payer,amount,paid_on,
      refunded_by,refunded_by_name,refund_signature) values($1,$2,'other',$3,'Other payee',50,$4,$5,'KEVIN LEE',$6)`,
      [id(41), `KLGPV-${String(year).slice(-2)}00002`, id(40), today, kevin, JSON.stringify(signature)]);
    await db.exec(migration);
    const saved = (await db.query<{ voucher: Voucher }>('select to_jsonb(v) voucher from payment_vouchers v where id=$1', [id(30)])).rows[0].voucher;
    expect(saved).toEqual({ ...old, member_id: resident, origin: 'deposit_refund' });
    expect((await db.query<{ member_id: string | null }>('select member_id from payment_vouchers where id=$1', [id(41)])).rows[0].member_id).toBeNull();
    expect(await refund(31, 20)).toEqual(saved);
    await expect(db.query('update payment_vouchers set member_id=$2 where id=$1', [id(30), memberA])).rejects.toThrow('cannot be changed');
    await expect(db.query('delete from payment_vouchers where id=$1', [id(30)])).rejects.toThrow('cannot be deleted');
    expect((await db.query<{ tgenabled: string }>("select tgenabled from pg_trigger where tgname='protect_payment_voucher'")).rows[0].tgenabled).toBe('O');
  });

  it('issues only one numbered PV with actual immutable staff/member snapshots and no invented receipt or cash', async () => {
    await db.exec(migration);
    const voucher = await legacy(30, resident, fikri);
    expect(voucher).toMatchObject({ voucher_no: `KLGPV-${String(year).slice(-2)}00001`, member_id: resident,
      origin: 'legacy_refund', deposit_receipt_id: null, refunded_by: fikri, refunded_by_name: 'FIKRI',
      refund_signature: secondSignature, payer: 'Old Resident', email: 'resident@example.com', member_reference: 'A101', amount: 10, paid_on: today });
    expect(await count('deposit_receipts')).toBe(0);
    expect(await count('membership_payment_ledger')).toBe(0);
    expect((await db.query('select kind,last_value from financial_document_counters')).rows).toEqual([{ kind: 'payment_voucher', last_value: 1 }]);
    await db.query('update profiles set full_name=$2 where id=$1', [fikri, 'Changed staff']);
    await db.query('update user_e_signatures set signature=$2 where user_id=$1', [fikri, JSON.stringify(signature)]);
    await db.query('update memberships set full_name=$2,email=$3 where id=$1', [resident, 'Changed member', 'changed@example.com']);
    expect(await legacy(30, resident, fikri)).toEqual(voucher);
    expect(await legacy(31, resident, kevin)).toEqual(voucher);
    await expect(legacy(30, memberB)).rejects.toThrow('identifier already used');
    const other = await legacy(32, memberB);
    expect(other.voucher_no).toBe(`KLGPV-${String(year).slice(-2)}00002`);
    await expect(legacy(30, memberB)).rejects.toThrow('identifier already used');
    expect(await count('payment_vouchers')).toBe(2);
    expect(await count('membership_activity')).toBe(2);
    expect((await db.query<{ summary: unknown }>('select get_deposit_document_summary() summary')).rows[0].summary)
      .toEqual({ receivedAmount: 0, openingAmount: 20, refundedAmount: 20, heldAmount: 0, heldCount: 0 });
    await expect(db.query('update payment_vouchers set origin=$2 where id=$1', [id(30), 'deposit_refund'])).rejects.toThrow('cannot be changed');
    await expect(db.query(`insert into payment_vouchers(id,voucher_no,source_module,deposit_receipt_id,member_id,origin,
      payer,email,member_reference,amount,paid_on,refunded_by,refunded_by_name,refund_signature)
      select $1,'KLGPV-9999999',source_module,deposit_receipt_id,member_id,origin,
      payer,email,member_reference,amount,paid_on,refunded_by,refunded_by_name,refund_signature
      from payment_vouchers where id=$2`, [id(33), id(30)]))
      .rejects.toThrow('gym_one_legacy_refund');
  });

  it('blocks alternate historical refund paths but permits a genuine new deposit cycle after a legacy refund', async () => {
    await db.exec(migration);
    await receive(20, memberB, 'existing', '2020-01-01', 'HANDWRITTEN-20');
    await expect(legacy(30, memberB)).rejects.toThrow('recorded Gym deposit');
    await refund(31, 20);
    await expect(legacy(32, memberB)).rejects.toThrow('recorded Gym deposit');
    const original = await legacy(33);
    await expect(receive(21, memberA, 'existing', '2020-01-01', 'OTHER-PAPER')).rejects.toThrow('already received a handwritten');
    await enableIsolatedCollectionClock();
    const fresh = await receive(22);
    expect(fresh.receipt_no).toBe(`KLGDR-${collectionDay.slice(2, 4)}00001`);
    await db.exec(`create or replace function public.assert_gym_deposits_started() returns date
      language sql stable security invoker set search_path = '' as $$ select date '${Number(collectionDay.slice(0, 4)) + 1}-01-01' $$;`);
    expect(await receive(22)).toEqual(fresh); // A retry after New Year keeps the original receipt.
    await enableIsolatedCollectionClock();
    const newRefund = await refund(34, 22, fikri);
    expect(newRefund).toMatchObject({ member_id: memberA, origin: 'deposit_refund', deposit_receipt_id: id(22), refunded_by: fikri });
    expect(await legacy(35)).toEqual(original);
    await expect(legacy(34, memberA)).rejects.toThrow('identifier already used');
    expect(await count('membership_payment_ledger')).toBe(1);
    expect(await count('deposit_receipts')).toBe(2);
    expect((await db.query<{ summary: unknown }>('select get_deposit_document_summary() summary')).rows[0].summary)
      .toEqual({ receivedAmount: 10, openingAmount: 20, refundedAmount: 30, heldAmount: 0, heldCount: 0 });
  });

  it('gates only new cash using the Malaysia clock and keeps old refunds available with service-only authorization', async () => {
    await db.exec(migration);
    if (today < '2026-12-01') {
      await expect(db.query('select assert_gym_deposits_started()')).rejects.toThrow('1 December 2026');
      await expect(receive(20)).rejects.toThrow('1 December 2026');
    } else {
      expect((await db.query<{ calendar_day: string }>("select to_char(assert_gym_deposits_started(),'YYYY-MM-DD') as calendar_day")).rows[0].calendar_day).toBe(today);
    }
    // Neither refund route depends on the new-collection launch helper.
    await receive(21, resident, 'existing', '2020-01-01', 'BEFORE-LAUNCH');
    expect((await refund(30, 21)).origin).toBe('deposit_refund');
    expect((await legacy(31)).origin).toBe('legacy_refund');
    for (const actor of [patrol, inactive]) await expect(legacy(32, memberC, actor)).rejects.toThrow('Admin permission');
    await expect(legacy(32, memberC, unsigned)).rejects.toThrow('e-signature');
    await enableIsolatedCollectionClock();
    await expect(receive(22, memberC, 'received', '2026-11-30')).rejects.toThrow('on or after 1 December');
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await expect(legacy(32, memberC)).rejects.toThrow('permission denied');
      await expect(db.query('select assert_gym_deposits_started()')).rejects.toThrow('permission denied');
      await expect(db.query('select * from payment_vouchers')).rejects.toThrow('permission denied');
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    expect((await legacy(32, memberC, fikri)).refunded_by).toBe(fikri);
    await db.exec('reset role');
    expect((await db.query<{ invoker: boolean; browser: boolean; server: boolean }>(`select not prosecdef invoker,
      has_function_privilege('authenticated',oid,'EXECUTE') browser,has_function_privilege('service_role',oid,'EXECUTE') server
      from pg_proc where proname in ('assert_gym_deposits_started','refund_legacy_gym_deposit')`)).rows)
      .toEqual([{ invoker: true, browser: false, server: true }, { invoker: true, browser: false, server: true }]);
  });

  it('serializes competing legacy requests to one PV and one counter use', async () => {
    await db.exec(migration);
    const results = await Promise.all([legacy(30), legacy(31, memberA, fikri), legacy(32)]);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(await count('payment_vouchers')).toBe(1);
    expect(await count('deposit_receipts')).toBe(0);
    expect(await count('membership_activity')).toBe(1);
    expect((await db.query('select last_value from financial_document_counters')).rows).toEqual([{ last_value: 1 }]);
  });
});
