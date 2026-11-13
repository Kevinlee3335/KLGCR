create table public.unifi_invoices (
  id uuid primary key default gen_random_uuid(),
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and period >= '2026-09'),
  source text not null check (source in ('manual', 'webmail')),
  source_message_id text check (length(source_message_id) between 1 and 998),
  invoice_number text check (length(invoice_number) between 1 and 120),
  account_number text check (account_number ~ '^[0-9]{10}$'),
  received_at timestamptz,
  due_date date,
  file_name text not null check (length(file_name) between 1 and 255),
  content_hash text not null unique check (content_hash ~ '^[a-f0-9]{64}$'),
  size_bytes integer not null check (size_bytes between 1 and 12582912),
  review_stage text not null default 'fikri' check (review_stage in ('fikri', 'kevin', 'james', 'approved')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  fikri_verified_at timestamptz,
  fikri_verified_by uuid references public.profiles(id),
  kevin_verified_at timestamptz,
  kevin_verified_by uuid references public.profiles(id),
  james_approved_at timestamptz,
  james_approved_by uuid references public.profiles(id),
  check ((fikri_verified_at is null) = (fikri_verified_by is null)),
  check ((kevin_verified_at is null) = (kevin_verified_by is null)),
  check ((james_approved_at is null) = (james_approved_by is null)),
  check ((fikri_verified_at is not null) = (review_stage in ('kevin', 'james', 'approved'))),
  check ((kevin_verified_at is not null) = (review_stage in ('james', 'approved'))),
  check ((james_approved_at is not null) = (review_stage = 'approved'))
);

create unique index unifi_invoices_period_invoice_number
  on public.unifi_invoices (period, invoice_number) where invoice_number is not null;
create index unifi_invoices_review_queue
  on public.unifi_invoices (review_stage, period desc, created_at desc, id desc);
create index unifi_invoices_archive_order
  on public.unifi_invoices (period desc, created_at desc, id desc);

alter table public.unifi_invoices enable row level security;
revoke all on public.unifi_invoices from public, anon, authenticated;
grant select, insert, update on public.unifi_invoices to service_role;

create table public.unifi_accounts (
  account_number text primary key check (account_number ~ '^[0-9]{10}$'),
  line_number integer not null unique check (line_number between 1 and 6)
);
alter table public.unifi_accounts enable row level security;
revoke all on public.unifi_accounts from public, anon, authenticated;
grant select on public.unifi_accounts to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('unifi-invoices', 'unifi-invoices', false, 12582912, array['application/pdf']);

create table public.unifi_webmail_connection (
  id boolean primary key default true check (id),
  encrypted_password text not null,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_error text
);
alter table public.unifi_webmail_connection enable row level security;
revoke all on public.unifi_webmail_connection from public, anon, authenticated;
grant select, insert, update on public.unifi_webmail_connection to service_role;

alter table public.document_review_push_outbox
  drop constraint document_review_push_outbox_document_type_check,
  add constraint document_review_push_outbox_document_type_check
    check (document_type in ('gym', 'billing', 'compliance', 'unifi_invoice'));

create function public.advance_unifi_invoice_review(p_invoice_id uuid, p_expected_stage text, p_actor_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_next_stage text;
  v_saved_stage text;
  v_now timestamptz := now();
begin
  v_next_stage := case p_expected_stage
    when 'fikri' then 'kevin'
    when 'kevin' then 'james'
    when 'james' then 'approved'
  end;
  if v_next_stage is null or p_actor_id is null
    or public.compliance_review_recipient(p_expected_stage) is distinct from p_actor_id
    or not exists (
      select 1 from public.profiles
      where id = p_actor_id and role = 'admin' and is_active and deleted_at is null
    )
  then raise exception 'This invoice is awaiting its assigned reviewer'; end if;

  update public.unifi_invoices set
    review_stage = v_next_stage,
    fikri_verified_at = case when p_expected_stage = 'fikri' then v_now else fikri_verified_at end,
    fikri_verified_by = case when p_expected_stage = 'fikri' then p_actor_id else fikri_verified_by end,
    kevin_verified_at = case when p_expected_stage = 'kevin' then v_now else kevin_verified_at end,
    kevin_verified_by = case when p_expected_stage = 'kevin' then p_actor_id else kevin_verified_by end,
    james_approved_at = case when p_expected_stage = 'james' then v_now else james_approved_at end,
    james_approved_by = case when p_expected_stage = 'james' then p_actor_id else james_approved_by end
  where id = p_invoice_id and review_stage = p_expected_stage
  returning review_stage into v_saved_stage;

  if v_saved_stage is null then raise exception 'The invoice review stage has changed'; end if;
  return v_saved_stage;
end;
$$;
revoke all on function public.advance_unifi_invoice_review(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.advance_unifi_invoice_review(uuid, text, uuid) to service_role;

create function public.queue_unifi_invoice_review_push()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_recipient uuid := public.compliance_review_recipient(new.review_stage);
  v_stage integer := array_position(array['fikri', 'kevin', 'james'], new.review_stage) - 1;
  v_heading text;
  v_body text := 'TM Unifi invoice · ' || new.period;
  v_href text := '/admin/unifi-invoices/' || new.id::text;
  v_event uuid;
begin
  if v_recipient is null or not exists (
    select 1 from public.profiles
    where id = v_recipient and role = 'admin' and is_active and deleted_at is null
  ) then return new; end if;

  v_heading := case when v_stage = 2 then 'TM Unifi invoice requires your approval'
    else 'TM Unifi invoice requires your verification' end;

  insert into public.document_review_push_outbox(document_type, document_id, stage, recipient_id, title, body, href)
  values ('unifi_invoice', new.id, v_stage, v_recipient, v_heading, v_body, v_href)
  on conflict (document_type, document_id, stage) do nothing returning id into v_event;

  if v_event is not null then
    insert into public.app_notifications(id, recipient_id, type, title, body, href, entity_id)
    values (v_event, v_recipient,
      case when v_stage = 2 then 'document_approval_requested' else 'document_verification' end,
      v_heading, v_body, v_href, new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.queue_unifi_invoice_review_push() from public, anon, authenticated;
grant execute on function public.queue_unifi_invoice_review_push() to service_role;
create trigger unifi_invoice_review_push after insert or update of review_stage on public.unifi_invoices
  for each row execute function public.queue_unifi_invoice_review_push();

create function public.claim_unifi_invoice_review_push(event_id uuid, token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_event public.document_review_push_outbox%rowtype;
  v_stage text;
begin
  select * into v_event from public.document_review_push_outbox
    where id = event_id and document_type = 'unifi_invoice' for update;
  if not found or v_event.delivered_at is not null or v_event.locked_until > now() or token is null then
    return false;
  end if;
  select review_stage into v_stage from public.unifi_invoices where id = v_event.document_id;
  if public.compliance_review_recipient(v_stage) is distinct from v_event.recipient_id
    or (array_position(array['fikri', 'kevin', 'james'], v_stage) - 1) is distinct from v_event.stage
    or not exists (
      select 1 from public.profiles
      where id = v_event.recipient_id and role = 'admin' and is_active and deleted_at is null
    )
  then
    update public.document_review_push_outbox set delivered_at = now(), last_error = 'superseded', locked_until = null
    where id = event_id;
    return false;
  end if;
  update public.document_review_push_outbox set claim_token = token, locked_until = now() + interval '2 minutes'
  where id = event_id;
  return true;
end;
$$;
revoke all on function public.claim_unifi_invoice_review_push(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_unifi_invoice_review_push(uuid, uuid) to service_role;
