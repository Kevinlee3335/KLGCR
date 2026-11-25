-- Deposit cash is separate from membership revenue. Numbering is shared across
-- modules; the Gym RPCs below are the first consumers of these document tables.
create table public.financial_document_counters (
  kind text not null check (kind in ('deposit_receipt', 'payment_voucher')),
  year integer not null check (year between 2000 and 2099),
  last_value integer not null default 0 check (last_value between 0 and 99999),
  primary key (kind, year)
);

create table public.deposit_receipts (
  id uuid primary key,
  receipt_no text not null unique check (length(btrim(receipt_no)) between 1 and 100),
  source_module text not null default 'gym' check (length(btrim(source_module)) between 1 and 80),
  member_id uuid references public.memberships(id),
  payer text not null check (length(btrim(payer)) between 1 and 200),
  email text not null default '',
  member_reference text not null default '',
  amount numeric(12,2) not null check (amount > 0),
  received_on date not null,
  received_by uuid not null references public.profiles(id),
  received_by_name text not null,
  issuer_signature jsonb,
  origin text not null check (origin in ('received', 'existing')),
  original_receipt_no text,
  note text not null default '' check (length(note) <= 1000),
  status text not null default 'held' check (status in ('held', 'refunded')),
  created_at timestamptz not null default now(),
  pdf_path text,
  pdf_error text,
  email_status text not null default 'pending' check (email_status in ('pending', 'sending', 'sent', 'failed', 'not_required')),
  email_error text,
  emailed_at timestamptz,
  delivery_claim_token uuid,
  delivery_claimed_at timestamptz,
  check (source_module <> 'gym' or (member_id is not null and amount = 10)),
  check ((origin = 'received' and original_receipt_no is null) or
         (origin = 'existing' and original_receipt_no is not null and receipt_no = original_receipt_no))
);
create unique index deposit_receipt_number_casefold on public.deposit_receipts(lower(receipt_no));
create unique index gym_one_held_deposit on public.deposit_receipts(member_id)
  where source_module = 'gym' and status = 'held';
create index deposit_receipts_list on public.deposit_receipts(received_on desc, id);
create index deposit_receipts_member on public.deposit_receipts(member_id, created_at desc);
create index deposit_receipts_delivery on public.deposit_receipts(email_status, delivery_claimed_at, created_at);

create table public.payment_vouchers (
  id uuid primary key,
  voucher_no text not null unique check (voucher_no ~ '^KLGPV-[0-9]{7}$'),
  source_module text not null default 'gym',
  deposit_receipt_id uuid not null unique references public.deposit_receipts(id),
  payer text not null,
  email text not null default '',
  member_reference text not null default '',
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null,
  refunded_by uuid not null references public.profiles(id),
  refunded_by_name text not null,
  refund_signature jsonb not null,
  created_at timestamptz not null default now(),
  pdf_path text,
  pdf_error text,
  email_status text not null default 'pending' check (email_status in ('pending', 'sending', 'sent', 'failed', 'not_required')),
  email_error text,
  emailed_at timestamptz,
  delivery_claim_token uuid,
  delivery_claimed_at timestamptz
);
create index payment_vouchers_list on public.payment_vouchers(paid_on desc, id);
create index payment_vouchers_delivery on public.payment_vouchers(email_status, delivery_claimed_at, created_at);

alter table public.financial_document_counters enable row level security;
alter table public.deposit_receipts enable row level security;
alter table public.payment_vouchers enable row level security;
revoke all on public.financial_document_counters, public.deposit_receipts, public.payment_vouchers from public, anon, authenticated;
grant all on public.financial_document_counters, public.deposit_receipts, public.payment_vouchers to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('deposit-documents','deposit-documents',false,5242880,array['application/pdf'])
on conflict (id) do nothing;

-- Reuse the validation rules of saved employee signatures without accepting
-- caller-supplied identity or signature snapshots in either cash RPC.
create function public.financial_signature_valid(p_signature jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare stroke jsonb; point jsonb; total integer := 0; image text; bytes bytea; w bigint; h bigint;
begin
  if p_signature is null or jsonb_typeof(p_signature) <> 'object' then return false; end if;
  if p_signature ? 'imageDataUrl' then
    image := p_signature->>'imageDataUrl';
    if image is null or length(image) > 180000 or image !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
      or p_signature->'strokes' is distinct from '[]'::jsonb then return false; end if;
    bytes := decode(substring(image from 23), 'base64');
    if octet_length(bytes) < 33 or encode(substring(bytes from 1 for 8),'hex') <> '89504e470d0a1a0a'
      or encode(substring(bytes from 9 for 8),'hex') <> '0000000d49484452' then return false; end if;
    w := get_byte(bytes,16)::bigint*16777216 + get_byte(bytes,17)::bigint*65536 + get_byte(bytes,18)::bigint*256 + get_byte(bytes,19);
    h := get_byte(bytes,20)::bigint*16777216 + get_byte(bytes,21)::bigint*65536 + get_byte(bytes,22)::bigint*256 + get_byte(bytes,23);
    return w between 1 and 1200 and h between 1 and 400;
  end if;
  if jsonb_typeof(p_signature->'strokes') is distinct from 'array'
    or jsonb_array_length(p_signature->'strokes') not between 1 and 80 then return false; end if;
  for stroke in select value from jsonb_array_elements(p_signature->'strokes') loop
    if jsonb_typeof(stroke) is distinct from 'array' or jsonb_array_length(stroke) not between 2 and 600 then return false; end if;
    total := total + jsonb_array_length(stroke);
    for point in select value from jsonb_array_elements(stroke) loop
      if jsonb_typeof(point) is distinct from 'array' or jsonb_array_length(point) <> 2
        or jsonb_typeof(point->0) <> 'number' or jsonb_typeof(point->1) <> 'number'
        or (point->>0)::numeric not between 0 and 1 or (point->>1)::numeric not between 0 and 1 then return false; end if;
    end loop;
  end loop;
  return total <= 5000;
exception when others then return false;
end $$;

create function public.next_financial_document_number(p_kind text, p_year integer) returns text
language plpgsql security invoker set search_path = '' as $$
declare n integer; existing_max integer; prefix text;
begin
  if p_kind is null or p_kind not in ('deposit_receipt', 'payment_voucher') or p_year is null or p_year not between 2000 and 2099 then
    raise exception 'Invalid financial document counter';
  end if;
  prefix := case p_kind when 'deposit_receipt' then 'KLGDR-' else 'KLGPV-' end || lpad((p_year % 100)::text, 2, '0');
  insert into public.financial_document_counters(kind, year) values (p_kind,p_year) on conflict do nothing;
  perform 1 from public.financial_document_counters where kind = p_kind and year = p_year for update;
  -- Existing/imported numbered documents reserve their original numbers too.
  if p_kind = 'deposit_receipt' then
    select coalesce(max(right(receipt_no,5)::integer),0) into existing_max
      from public.deposit_receipts where upper(receipt_no) ~ ('^' || prefix || '[0-9]{5}$');
  else
    select coalesce(max(right(voucher_no,5)::integer),0) into existing_max
      from public.payment_vouchers where voucher_no ~ ('^' || prefix || '[0-9]{5}$');
  end if;
  update public.financial_document_counters set last_value = greatest(last_value,existing_max) + 1
    where kind = p_kind and year = p_year and greatest(last_value,existing_max) < 99999 returning last_value into n;
  if n is null then raise exception 'Financial document sequence exhausted for this year'; end if;
  return prefix || lpad(n::text,5,'0');
end $$;

create function public.record_gym_deposit(
  p_id uuid, p_member uuid, p_actor uuid, p_received_on date,
  p_origin text default 'received', p_original_receipt_no text default '', p_note text default ''
) returns public.deposit_receipts
language plpgsql security invoker set search_path = '' as $$
declare actor_name text; member public.memberships; saved public.deposit_receipts;
  stamp jsonb; number text; original_number text := nullif(btrim(p_original_receipt_no),'');
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  select full_name into actor_name from public.profiles where id = p_actor and role = 'admin' and is_active and deleted_at is null;
  if actor_name is null then raise exception 'Admin permission required'; end if;
  if p_id is null or p_member is null or p_received_on is null or p_received_on < date '2000-01-01' or p_received_on > today
    or p_origin is null or p_origin not in ('received','existing') or p_note is null or length(p_note) > 1000
    or p_note ~ '[[:cntrl:]]' then raise exception 'Invalid deposit details'; end if;
  if p_origin = 'received' and (extract(year from p_received_on) <> extract(year from today) or original_number is not null) then
    raise exception 'New cash receipt must use the current year; record older deposits as Existing Deposit';
  end if;
  if p_origin = 'existing' and (original_number is null or length(original_number) > 100 or original_number ~ '[[:cntrl:]]') then
    raise exception 'Original deposit receipt number is required';
  end if;
  -- Serializes different request IDs from multiple tabs for the same member.
  select * into member from public.memberships where id = p_member for update;
  if member.id is null then raise exception 'Member not found'; end if;
  select * into saved from public.deposit_receipts where id = p_id;
  if found then
    if saved.source_module <> 'gym' or saved.member_id <> p_member or saved.received_by <> p_actor
      or saved.received_on <> p_received_on or saved.origin <> p_origin or saved.note <> btrim(p_note)
      or saved.original_receipt_no is distinct from original_number then raise exception 'Deposit request identifier already used'; end if;
    return saved;
  end if;
  if p_origin = 'received' and member.member_type <> 'outsider' then raise exception 'Cash Gym deposits apply to Non Residence members'; end if;
  if exists(select 1 from public.deposit_receipts where member_id = p_member and source_module = 'gym' and status = 'held') then
    raise exception 'A deposit is already held for this member';
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

create function public.refund_gym_deposit(p_id uuid,p_deposit uuid,p_actor uuid) returns public.payment_vouchers
language plpgsql security invoker set search_path = '' as $$
declare actor_name text; receipt public.deposit_receipts; saved public.payment_vouchers; stamp jsonb;
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  select full_name into actor_name from public.profiles where id = p_actor and role = 'admin' and is_active and deleted_at is null;
  if actor_name is null then raise exception 'Admin permission required'; end if;
  if p_id is null or p_deposit is null then raise exception 'Invalid refund request'; end if;
  select * into receipt from public.deposit_receipts where id = p_deposit and source_module = 'gym' for update;
  if receipt.id is null then raise exception 'Deposit not found'; end if;
  select * into saved from public.payment_vouchers where deposit_receipt_id = receipt.id;
  if found then return saved; end if;
  if receipt.status <> 'held' then raise exception 'Deposit is not available for refund'; end if;
  if exists(select 1 from public.payment_vouchers where id = p_id) then raise exception 'Refund request identifier already used'; end if;
  select signature into stamp from public.user_e_signatures where user_id = p_actor;
  if not public.financial_signature_valid(stamp) then raise exception 'Save your employee e-signature before refunding'; end if;
  insert into public.payment_vouchers(id,voucher_no,source_module,deposit_receipt_id,payer,email,member_reference,amount,paid_on,
    refunded_by,refunded_by_name,refund_signature)
  values(p_id,public.next_financial_document_number('payment_voucher',extract(year from today)::integer),'gym',receipt.id,
    receipt.payer,receipt.email,receipt.member_reference,receipt.amount,today,p_actor,actor_name,stamp) returning * into saved;
  update public.deposit_receipts set status = 'refunded' where id = receipt.id;
  insert into public.membership_activity(member_id,event,actor_id,details)
  values(receipt.member_id,'deposit_refunded',p_actor,jsonb_build_object('deposit_id',receipt.id,'voucher_id',saved.id,
    'voucher_no',saved.voucher_no,'receipt_no',receipt.receipt_no,'amount',saved.amount));
  return saved;
end $$;

-- Cash facts and signature snapshots remain fixed after issuance. Operational
-- delivery statuses can change without changing the financial transaction.
create function public.protect_deposit_document() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare mutable_columns text[] := array['pdf_path','pdf_error','email_status','email_error','emailed_at','delivery_claim_token','delivery_claimed_at'];
begin
  if tg_op = 'DELETE' then raise exception 'Issued deposit documents cannot be deleted'; end if;
  if tg_table_name = 'deposit_receipts' then
    mutable_columns := mutable_columns || 'status'::text;
    if new.status is distinct from old.status and (old.status <> 'held' or new.status <> 'refunded'
      or not exists(select 1 from public.payment_vouchers where deposit_receipt_id = old.id)) then
      raise exception 'Use the signed deposit refund operation';
    end if;
  end if;
  if to_jsonb(new) - mutable_columns is distinct from to_jsonb(old) - mutable_columns then
    raise exception 'Issued deposit document details cannot be changed';
  end if;
  if old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path then
    raise exception 'An archived deposit document cannot be replaced';
  end if;
  return new;
end $$;
create trigger protect_deposit_receipt before update or delete on public.deposit_receipts
  for each row execute function public.protect_deposit_document();
create trigger protect_payment_voucher before update or delete on public.payment_vouchers
  for each row execute function public.protect_deposit_document();

-- The older payment-list editor must not hide or renumber an issued deposit.
create function public.protect_deposit_ledger_entry() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if exists(select 1 from public.deposit_receipts where id = old.id and origin = 'received') then
    raise exception 'Issued deposit receipt ledger entries cannot be changed or deleted';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger protect_deposit_ledger_entry before update or delete on public.membership_payment_ledger
  for each row execute function public.protect_deposit_ledger_entry();

create function public.get_deposit_document_summary() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'receivedAmount',coalesce(sum(amount) filter (where origin = 'received'),0),
    'openingAmount',coalesce(sum(amount) filter (where origin = 'existing'),0),
    'refundedAmount',(select coalesce(sum(amount),0) from public.payment_vouchers),
    'heldAmount',coalesce(sum(amount) filter (where status = 'held'),0),
    'heldCount',count(*) filter (where status = 'held')
  ) from public.deposit_receipts;
$$;

revoke all on function public.financial_signature_valid(jsonb),
  public.next_financial_document_number(text,integer),
  public.record_gym_deposit(uuid,uuid,uuid,date,text,text,text),
  public.refund_gym_deposit(uuid,uuid,uuid),public.protect_deposit_document(),public.protect_deposit_ledger_entry(),
  public.get_deposit_document_summary() from public,anon,authenticated;
grant execute on function public.financial_signature_valid(jsonb),
  public.next_financial_document_number(text,integer),
  public.record_gym_deposit(uuid,uuid,uuid,date,text,text,text),
  public.refund_gym_deposit(uuid,uuid,uuid),public.protect_deposit_document(),public.protect_deposit_ledger_entry(),
  public.get_deposit_document_summary() to service_role;
