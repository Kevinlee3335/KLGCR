-- Incoming customer evidence is a queue, never an automatic payment posting.
-- These tables and functions are server-only; every user-facing route checks active Admin access.
create table public.payment_mail_connections (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  enabled_from timestamptz not null default now(),
  revoked_at timestamptz,
  last_received_at timestamptz,
  last_checked_at timestamptz,
  last_error text
);

create table public.payment_mail_messages (
  id uuid primary key default gen_random_uuid(),
  mailbox text not null default 'klgresidenceenquiry@gmail.com' check (mailbox = 'klgresidenceenquiry@gmail.com'),
  gmail_message_id text not null unique check (gmail_message_id ~ '^[a-fA-F0-9]{1,64}$'),
  gmail_thread_id text,
  sender_email text not null check (sender_email = lower(btrim(sender_email)) and length(sender_email) <= 254 and sender_email ~ '^[^[:space:]@,;]+@[^[:space:]@,;]+[.][^[:space:]@,;]+$'),
  sender_name text not null default '',
  subject text not null default '',
  body_text text not null default '' check (length(body_text) <= 200000),
  received_at timestamptz not null,
  status text not null default 'pending_verification' check (status in ('pending_verification','needs_review','verified','rejected','duplicate','ignored')),
  suggested_company_key text,
  suggested_amount numeric(12,2) check (suggested_amount > 0),
  suggested_paid_on date,
  suggested_reference text not null default '',
  suggested_invoice_numbers text[] not null default '{}',
  review_reasons text[] not null default '{}',
  extraction_status text not null default 'pending' check (extraction_status in ('pending','ready','needs_review','failed')),
  extraction_details jsonb not null default '{}' check (jsonb_typeof(extraction_details) = 'object'),
  attachment_count integer not null default 0 check (attachment_count >= 0),
  ingestion_completed_at timestamptz,
  duplicate_of uuid references public.payment_mail_messages(id),
  receipt_id uuid unique references public.official_receipts(id),
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  rejected_by uuid references public.profiles(id),
  rejected_at timestamptz,
  rejection_reason text,
  verification_details jsonb not null default '{}' check (jsonb_typeof(verification_details) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (duplicate_of is distinct from id),
  check ((status = 'verified') = (receipt_id is not null)),
  check (status <> 'verified' or (verified_by is not null and verified_at is not null)),
  check (status <> 'rejected' or (rejected_by is not null and rejected_at is not null and length(btrim(rejection_reason)) > 0))
);
create index payment_mail_pending on public.payment_mail_messages(status,received_at,id) where ingestion_completed_at is not null;
create index payment_mail_sender on public.payment_mail_messages(sender_email,received_at desc);
create index payment_mail_duplicate on public.payment_mail_messages(duplicate_of) where duplicate_of is not null;

create table public.payment_mail_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.payment_mail_messages(id),
  gmail_part_id text not null check (length(gmail_part_id) between 1 and 200),
  filename text not null check (length(filename) between 1 and 300),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending','ready','failed','ignored')),
  extraction_text text not null default '',
  extraction_details jsonb not null default '{}' check (jsonb_typeof(extraction_details) = 'object'),
  created_at timestamptz not null default now(),
  unique (message_id,gmail_part_id),
  check (storage_path = 'payment-mail/' || message_id::text || '/' || content_hash ||
    case mime_type when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end)
);
create index payment_mail_proof_hash on public.payment_mail_attachments(content_hash);

alter table public.payment_mail_connections enable row level security;
alter table public.payment_mail_messages enable row level security;
alter table public.payment_mail_attachments enable row level security;
revoke all on public.payment_mail_connections,public.payment_mail_messages,public.payment_mail_attachments from public,anon,authenticated;
grant all on public.payment_mail_connections,public.payment_mail_messages,public.payment_mail_attachments to service_role;

-- Retain the existing private proof bucket so existing Receipt proof links remain valid.
-- The manual finance upload endpoint keeps its existing 3 MB limit.
update storage.buckets set file_size_limit = greatest(coalesce(file_size_limit,0),10485760)
where id = 'billing-payments';

-- A verified bank transfer may cover both invoice types in one official Receipt.
alter table public.official_receipts drop constraint official_receipts_kind_check;
alter table public.official_receipts add constraint official_receipts_kind_check check (kind in ('rental','utility','billing','gym'));

create function public.verify_payment_mail(
  p_id uuid, p_actor uuid, p_company_key text, p_date date, p_amount numeric,
  p_reference text, p_proof_id uuid, p_allocations jsonb,
  p_bank_received boolean, p_company_confirmed boolean
) returns public.official_receipts
language plpgsql security invoker set search_path = '' as $$
declare
  message public.payment_mail_messages;
  proof public.payment_mail_attachments;
  result public.official_receipts;
  invoice public.billing_preview_runs;
  allocation jsonb;
  line jsonb;
  account_lock record;
  idx integer;
  value numeric;
  paid numeric;
  total numeric := 0;
  confirmed_email text := lower(btrim(p_company_key));
  contact_email text;
  selected_account_key text;
  selected_account_name text;
  invoice_number text;
  reference_key text := regexp_replace(upper(btrim(coalesce(p_reference,''))),'[^A-Z0-9]','','g');
  payers text[] := '{}';
  kinds text[] := '{}';
  details jsonb := '[]';
  description text := '';
begin
  if not exists (select 1 from public.profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then
    raise exception 'Admin permission required';
  end if;
  if p_bank_received is distinct from true or p_company_confirmed is distinct from true then
    raise exception 'Confirm the bank payment and the selected payer accounts before verifying';
  end if;
  if confirmed_email is null or length(confirmed_email)>254 or confirmed_email !~ '^[^[:space:]@,;]+@[^[:space:]@,;]+[.][^[:space:]@,;]+$'
    or p_date is null or p_date>(now() at time zone 'Asia/Kuala_Lumpur')::date
    or p_amount is null or p_amount<=0 or p_amount>1000000000 or p_amount<>round(p_amount,2)
    or length(coalesce(p_reference,''))>200 then
    raise exception 'Invalid confirmed payment details';
  end if;

  -- One stable queue UUID owns one Receipt for its entire lifetime, including retry-after-timeout.
  select * into message from public.payment_mail_messages where id=p_id for update;
  if not found then raise exception 'Payment email not found'; end if;
  if message.status='verified' then
    select * into strict result from public.official_receipts where id=message.receipt_id;
    return result;
  end if;
  if message.status not in ('pending_verification','needs_review') or message.duplicate_of is not null then
    raise exception 'This email cannot be verified in its current status';
  end if;
  if message.ingestion_completed_at is null then raise exception 'Wait for all email attachments to finish importing'; end if;
  select * into proof from public.payment_mail_attachments where id=p_proof_id and message_id=p_id and status='ready';
  if not found then raise exception 'Select a saved payment proof from this email'; end if;
  if jsonb_typeof(p_allocations) is distinct from 'array' then raise exception 'Select invoice allocations'; end if;
  if jsonb_array_length(p_allocations) not between 1 and 120 then raise exception 'Select invoice allocations'; end if;
  for allocation in select * from jsonb_array_elements(p_allocations) loop
    if jsonb_typeof(allocation) is distinct from 'object'
      or jsonb_typeof(allocation->'run_id') is distinct from 'string'
      or jsonb_typeof(allocation->'line_index') is distinct from 'number'
      or (allocation->>'line_index') !~ '^[0-9]+$'
      or jsonb_typeof(allocation->'amount') is distinct from 'number' then
      raise exception 'Invalid invoice allocation';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_allocations) a
    group by (a->>'run_id')::uuid,(a->>'line_index')::integer having count(*)>1) then
    raise exception 'Duplicate invoice allocation';
  end if;

  -- Serialize duplicate attachments/references across separate emails, then use the same
  -- per-account locks as manual record_billing_payment to protect outstanding balances.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment-proof:'||proof.content_hash,0));
  if reference_key<>'' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment-reference:'||confirmed_email||':'||p_date::text||':'||(p_amount*100)::bigint::text||':'||reference_key,0));
  end if;
  for account_lock in
    select distinct r.kind,coalesce(nullif(l.line->>'accountId',''),
      'legacy:'||md5(lower(btrim(coalesce(l.line->>'name','')))||coalesce((l.line->'addr')::text,''))) as account_key
    from jsonb_array_elements(p_allocations) a
    join public.billing_preview_runs r on r.id=(a->>'run_id')::uuid
    cross join lateral (select r.snapshot->'lines'->((a->>'line_index')::integer) as line) l
    where r.kind in ('rental','utility')
    order by r.kind,account_key
  loop
    if account_lock.account_key is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('billing:'||account_lock.kind||':'||account_lock.account_key,0));
    end if;
  end loop;
  if exists (
    select 1 from public.payment_mail_attachments a
    join public.payment_mail_messages m on m.id=a.message_id
    join public.official_receipts r on r.id=m.receipt_id and r.proof_path=a.storage_path
    where a.content_hash=proof.content_hash and m.id<>p_id and m.status='verified'
  ) then raise exception 'This payment proof already belongs to a verified payment. Review the duplicate email'; end if;
  if reference_key<>'' and exists (
    select 1 from public.official_receipts r
    where r.kind in ('rental','utility','billing') and lower(btrim(r.email))=confirmed_email
      and r.paid_on=p_date and r.amount=p_amount
      and regexp_replace(upper(btrim(r.bank_reference)),'[^A-Z0-9]','','g')=reference_key
  ) then raise exception 'A Receipt already exists for this bank reference, date and amount. Review the duplicate payment'; end if;

  for allocation in select a from jsonb_array_elements(p_allocations) a order by a->>'run_id',(a->>'line_index')::integer loop
    idx:=(allocation->>'line_index')::integer;
    value:=(allocation->>'amount')::numeric;
    select * into invoice from public.billing_preview_runs where id=(allocation->>'run_id')::uuid and kind in ('rental','utility');
    if not found or not exists (
      select 1 from public.billing_run_approvals where run_id=invoice.id and approved_by_user='eeab5f04-30c3-42bd-a095-58e56c814358'::uuid
    ) then raise exception 'Only approved invoices can receive payments'; end if;
    line:=invoice.snapshot->'lines'->idx;
    selected_account_key:=coalesce(nullif(line->>'accountId',''),
      'legacy:'||md5(lower(btrim(coalesce(line->>'name','')))||coalesce((line->'addr')::text,'')));
    selected_account_name:=nullif(btrim(line->>'name'),'');
    if idx<0 or line is null or selected_account_name is null
      or jsonb_typeof(line->'amount') is distinct from 'number'
      or value is null or value<=0 or value>1000000000 or value<>round(value,2) then
      raise exception 'Invalid invoice allocation';
    end if;
    -- The recipient must already be registered against every selected account.
    -- An incoming sender or AI suggestion can never create/change this recipient.
    select c.email into contact_email from public.billing_payment_contacts c
      where c.kind=invoice.kind and c.account_key=selected_account_key for share;
    if not found or lower(btrim(contact_email)) is distinct from confirmed_email then
      raise exception 'Every selected invoice must belong to the confirmed registered email group';
    end if;
    select coalesce(sum(amount),0) into paid from public.billing_payment_allocations where run_id=invoice.id and line_index=idx;
    if paid+value>(line->>'amount')::numeric then raise exception 'Payment exceeds invoice balance. Refresh before confirming'; end if;
    if invoice.kind='rental' then
      select p.rental_invoice_no into invoice_number from public.billing_customer_invoice_packages p
      where p.rental_run_id=invoice.id and p.rental_line_index=idx and p.confirmed_at is not null;
    else
      select p.utility_invoice_no into invoice_number from public.billing_customer_invoice_packages p
      where p.utility_run_id=invoice.id and p.utility_line_index=idx and p.confirmed_at is not null;
    end if;
    invoice_number:=coalesce(invoice_number,line->>'billNo','');
    total:=total+value;
    if not selected_account_name=any(payers) then payers:=array_append(payers,selected_account_name); end if;
    if not invoice.kind=any(kinds) then kinds:=array_append(kinds,invoice.kind); end if;
    description:=description||case when description='' then '' else '; ' end||
      case invoice.kind when 'rental' then 'Rental ' else 'Utilities ' end||invoice.period||' - '||invoice_number||' RM '||to_char(value,'FM9999999990.00');
    details:=details||jsonb_build_array(jsonb_build_object('run_id',invoice.id,'line_index',idx,'kind',invoice.kind,'period',invoice.period,
      'account_key',selected_account_key,'account_name',selected_account_name,'bill_no',invoice_number,'amount',value));
  end loop;
  if total<>p_amount then raise exception 'Invoice allocations must equal the confirmed bank amount'; end if;

  result:=public.issue_official_receipt('payment-mail:'||p_id::text,
    case when cardinality(kinds)>1 then 'billing' else kinds[1] end,p_date,array_to_string(payers,' / '),confirmed_email,total,
    description,proof.storage_path,btrim(coalesce(p_reference,'')),p_actor);
  insert into public.billing_payment_allocations(receipt_id,run_id,line_index,amount)
    select result.id,(a->>'run_id')::uuid,(a->>'line_index')::integer,(a->>'amount')::numeric from jsonb_array_elements(p_allocations) a;
  update public.payment_mail_messages set status='verified',receipt_id=result.id,verified_by=p_actor,verified_at=now(),updated_at=now(),
    verification_details=jsonb_build_object('bank_received',true,'company_confirmed',true,'registered_email',confirmed_email,'proof_id',proof.id,
      'amount',total,'paid_on',p_date,'bank_reference',btrim(coalesce(p_reference,'')),'allocations',details)
    where id=p_id;
  return result;
end;
$$;
revoke all on function public.verify_payment_mail(uuid,uuid,text,date,numeric,text,uuid,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.verify_payment_mail(uuid,uuid,text,date,numeric,text,uuid,jsonb,boolean,boolean) to service_role;

create function public.reject_payment_mail(p_id uuid,p_actor uuid,p_reason text) returns public.payment_mail_messages
language plpgsql security invoker set search_path='' as $$
declare message public.payment_mail_messages;
begin
  if not exists (select 1 from public.profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then
    raise exception 'Admin permission required';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 2000 then raise exception 'Enter a rejection reason'; end if;
  select * into message from public.payment_mail_messages where id=p_id for update;
  if not found then raise exception 'Payment email not found'; end if;
  if message.status='verified' then raise exception 'A verified payment cannot be rejected'; end if;
  if message.status='rejected' then return message; end if;
  if message.status='ignored' then raise exception 'This email is not a payment verification item'; end if;
  update public.payment_mail_messages set status='rejected',rejected_by=p_actor,rejected_at=now(),rejection_reason=btrim(p_reason),updated_at=now()
    where id=p_id returning * into message;
  return message;
end;
$$;
revoke all on function public.reject_payment_mail(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reject_payment_mail(uuid,uuid,text) to service_role;
