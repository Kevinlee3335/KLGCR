-- Handwritten deposits can be refunded directly. Their PV records the actual
-- refund; it does not manufacture a historical receipt or new cash collection.
alter table public.payment_vouchers add column member_id uuid references public.memberships(id);
alter table public.payment_vouchers add column origin text not null default 'deposit_refund'
  check (origin in ('deposit_refund','legacy_refund'));
-- Issued facts remain immutable outside this deterministic upgrade backfill.
alter table public.payment_vouchers disable trigger protect_payment_voucher;
update public.payment_vouchers v set member_id = d.member_id
  from public.deposit_receipts d where d.id = v.deposit_receipt_id;
alter table public.payment_vouchers enable trigger protect_payment_voucher;
alter table public.payment_vouchers add constraint gym_payment_voucher_member check (source_module <> 'gym' or member_id is not null);
alter table public.payment_vouchers alter column deposit_receipt_id drop not null;
alter table public.payment_vouchers add constraint payment_voucher_origin_receipt check (
  (origin = 'deposit_refund' and deposit_receipt_id is not null) or
  (origin = 'legacy_refund' and deposit_receipt_id is null and source_module = 'gym' and amount = 10)
);
create unique index gym_one_legacy_refund on public.payment_vouchers(member_id)
  where source_module = 'gym' and origin = 'legacy_refund';
create index payment_vouchers_member on public.payment_vouchers(member_id,created_at desc);

-- No caller-supplied clock or bypass flag. Only new cash collection starts on
-- December 1; existing deposits and refunds remain available before that date.
create function public.assert_gym_deposits_started() returns date
language plpgsql stable security invoker set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if today < date '2026-12-01' then
    raise exception 'New Gym deposits start on 1 December 2026 (Malaysia time)';
  end if;
  return today;
end $$;

create or replace function public.record_gym_deposit(
  p_id uuid,p_member uuid,p_actor uuid,p_received_on date,
  p_origin text default 'received',p_original_receipt_no text default '',p_note text default ''
) returns public.deposit_receipts
language plpgsql security invoker set search_path = '' as $$
declare actor_name text; member public.memberships; saved public.deposit_receipts;
  stamp jsonb; number text; original_number text := nullif(btrim(p_original_receipt_no),'');
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  select full_name into actor_name from public.profiles where id = p_actor and role = 'admin' and is_active and deleted_at is null;
  if actor_name is null then raise exception 'Admin permission required'; end if;
  if p_origin = 'received' then
    today := public.assert_gym_deposits_started();
    if p_received_on < date '2026-12-01' then raise exception 'New cash receipt date must be on or after 1 December 2026'; end if;
  end if;
  if p_id is null or p_member is null or p_received_on is null or p_received_on < date '2000-01-01' or p_received_on > today
    or p_origin is null or p_origin not in ('received','existing') or p_note is null or length(p_note) > 1000
    or p_note ~ '[[:cntrl:]]' then raise exception 'Invalid deposit details'; end if;
  if p_origin = 'existing' and (original_number is null or length(original_number) > 100 or original_number ~ '[[:cntrl:]]') then
    raise exception 'Original deposit receipt number is required';
  end if;
  select * into member from public.memberships where id = p_member for update;
  if member.id is null then raise exception 'Member not found'; end if;
  select * into saved from public.deposit_receipts where id = p_id;
  if found then
    if saved.source_module <> 'gym' or saved.member_id <> p_member or saved.received_by <> p_actor
      or saved.received_on <> p_received_on or saved.origin <> p_origin or saved.note <> btrim(p_note)
      or saved.original_receipt_no is distinct from original_number then raise exception 'Deposit request identifier already used'; end if;
    return saved;
  end if;
  if p_origin = 'received' and (extract(year from p_received_on) <> extract(year from today) or original_number is not null) then
    raise exception 'New cash receipt must use the current year; record older deposits as Existing Deposit';
  end if;
  if p_origin = 'received' and member.member_type <> 'outsider' then raise exception 'Cash Gym deposits apply to Non Residence members'; end if;
  if exists(select 1 from public.deposit_receipts where member_id = p_member and source_module = 'gym' and status = 'held') then
    raise exception 'A deposit is already held for this member';
  end if;
  if p_origin = 'existing' and exists(select 1 from public.payment_vouchers where member_id = p_member and source_module = 'gym' and origin = 'legacy_refund') then
    raise exception 'This member already received a handwritten deposit refund';
  end if;
  if p_origin = 'existing' and exists(select 1 from public.deposit_receipts where lower(receipt_no) = lower(original_number)) then
    raise exception 'This original deposit receipt is already recorded';
  end if;
  select signature into stamp from public.user_e_signatures where user_id = p_actor;
  if not public.financial_signature_valid(stamp) then stamp := null; end if;
  number := case when p_origin = 'existing' then original_number
    else public.next_financial_document_number('deposit_receipt',extract(year from today)::integer) end;
  insert into public.deposit_receipts(id,receipt_no,source_module,member_id,payer,email,member_reference,amount,
    received_on,received_by,received_by_name,issuer_signature,origin,original_receipt_no,note,email_status)
  values(p_id,number,'gym',member.id,member.full_name,member.email,
    case when member.member_type = 'outsider' then coalesce(member.member_number,'') else coalesce(member.room_no,'') end,
    10,p_received_on,p_actor,actor_name,stamp,p_origin,original_number,btrim(p_note),
    case when p_origin = 'existing' then 'not_required' else 'pending' end) returning * into saved;
  if p_origin = 'received' then
    insert into public.membership_payment_ledger(id,source,collected_on,full_name,member_type,member_reference,receipt_no,amount,kind,created_by)
    values(p_id,'manual',p_received_on,saved.payer,member.member_type,saved.member_reference,number,10,'access_card_deposit',p_actor);
  end if;
  insert into public.membership_activity(member_id,event,actor_id,details)
  values(member.id,case when p_origin = 'existing' then 'existing_deposit_recorded' else 'deposit_received' end,p_actor,
    jsonb_build_object('deposit_id',saved.id,'receipt_no',saved.receipt_no,'amount',10,'received_on',p_received_on));
  return saved;
end $$;

create or replace function public.refund_gym_deposit(p_id uuid,p_deposit uuid,p_actor uuid) returns public.payment_vouchers
language plpgsql security invoker set search_path = '' as $$
declare actor_name text; receipt public.deposit_receipts; saved public.payment_vouchers; stamp jsonb;
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  select full_name into actor_name from public.profiles where id = p_actor and role = 'admin' and is_active and deleted_at is null;
  if actor_name is null then raise exception 'Admin permission required'; end if;
  if p_id is null or p_deposit is null then raise exception 'Invalid refund request'; end if;
  select * into receipt from public.deposit_receipts where id = p_deposit and source_module = 'gym' for update;
  if receipt.id is null then raise exception 'Deposit not found'; end if;
  if exists(select 1 from public.payment_vouchers where id = p_id and deposit_receipt_id is distinct from receipt.id) then
    raise exception 'Refund request identifier already used';
  end if;
  select * into saved from public.payment_vouchers where deposit_receipt_id = receipt.id;
  if found then return saved; end if;
  if receipt.status <> 'held' then raise exception 'Deposit is not available for refund'; end if;
  select signature into stamp from public.user_e_signatures where user_id = p_actor;
  if not public.financial_signature_valid(stamp) then raise exception 'Save your employee e-signature before refunding'; end if;
  insert into public.payment_vouchers(id,voucher_no,source_module,deposit_receipt_id,member_id,origin,payer,email,member_reference,amount,paid_on,
    refunded_by,refunded_by_name,refund_signature)
  values(p_id,public.next_financial_document_number('payment_voucher',extract(year from today)::integer),'gym',receipt.id,receipt.member_id,'deposit_refund',
    receipt.payer,receipt.email,receipt.member_reference,receipt.amount,today,p_actor,actor_name,stamp) returning * into saved;
  update public.deposit_receipts set status = 'refunded' where id = receipt.id;
  insert into public.membership_activity(member_id,event,actor_id,details)
  values(receipt.member_id,'deposit_refunded',p_actor,jsonb_build_object('deposit_id',receipt.id,'voucher_id',saved.id,
    'voucher_no',saved.voucher_no,'receipt_no',receipt.receipt_no,'amount',saved.amount));
  return saved;
end $$;

create function public.refund_legacy_gym_deposit(p_id uuid,p_member uuid,p_actor uuid) returns public.payment_vouchers
language plpgsql security invoker set search_path = '' as $$
declare actor_name text; member public.memberships; saved public.payment_vouchers; stamp jsonb;
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  select full_name into actor_name from public.profiles where id = p_actor and role = 'admin' and is_active and deleted_at is null;
  if actor_name is null then raise exception 'Admin permission required'; end if;
  if p_id is null or p_member is null then raise exception 'Invalid handwritten deposit refund request'; end if;
  select * into member from public.memberships where id = p_member for update;
  if member.id is null then raise exception 'Member not found'; end if;
  select * into saved from public.payment_vouchers where id = p_id;
  if found then
    if saved.source_module <> 'gym' or saved.origin <> 'legacy_refund' or saved.member_id <> p_member then
      raise exception 'Refund request identifier already used';
    end if;
    return saved;
  end if;
  select * into saved from public.payment_vouchers where member_id = p_member and source_module = 'gym' and origin = 'legacy_refund';
  if found then return saved; end if;
  if exists(select 1 from public.deposit_receipts where member_id = p_member and source_module = 'gym') then
    raise exception 'This member has a recorded Gym deposit; use its receipt refund';
  end if;
  select signature into stamp from public.user_e_signatures where user_id = p_actor;
  if not public.financial_signature_valid(stamp) then raise exception 'Save your employee e-signature before refunding'; end if;
  insert into public.payment_vouchers(id,voucher_no,source_module,deposit_receipt_id,member_id,origin,payer,email,member_reference,amount,paid_on,
    refunded_by,refunded_by_name,refund_signature)
  values(p_id,public.next_financial_document_number('payment_voucher',extract(year from today)::integer),'gym',null,member.id,'legacy_refund',
    member.full_name,member.email,case when member.member_type = 'outsider' then coalesce(member.member_number,'') else coalesce(member.room_no,'') end,
    10,today,p_actor,actor_name,stamp) returning * into saved;
  insert into public.membership_activity(member_id,event,actor_id,details)
  values(member.id,'legacy_deposit_refunded',p_actor,jsonb_build_object('voucher_id',saved.id,'voucher_no',saved.voucher_no,
    'origin','legacy_refund','amount',saved.amount));
  return saved;
end $$;

create or replace function public.get_deposit_document_summary() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'receivedAmount',coalesce(sum(amount) filter (where origin = 'received'),0),
    'openingAmount',coalesce(sum(amount) filter (where origin = 'existing'),0)
      + (select coalesce(sum(amount),0) from public.payment_vouchers where origin = 'legacy_refund'),
    'refundedAmount',(select coalesce(sum(amount),0) from public.payment_vouchers),
    'heldAmount',coalesce(sum(amount) filter (where status = 'held'),0),
    'heldCount',count(*) filter (where status = 'held')
  ) from public.deposit_receipts;
$$;

revoke all on function public.assert_gym_deposits_started(),public.refund_legacy_gym_deposit(uuid,uuid,uuid),
  public.record_gym_deposit(uuid,uuid,uuid,date,text,text,text),public.refund_gym_deposit(uuid,uuid,uuid),
  public.get_deposit_document_summary() from public,anon,authenticated;
grant execute on function public.assert_gym_deposits_started(),public.refund_legacy_gym_deposit(uuid,uuid,uuid),
  public.record_gym_deposit(uuid,uuid,uuid,date,text,text,text),public.refund_gym_deposit(uuid,uuid,uuid),
  public.get_deposit_document_summary() to service_role;
