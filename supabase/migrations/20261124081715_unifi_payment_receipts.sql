create table public.unifi_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  source_message_id text not null unique check(length(source_message_id) between 1 and 998),
  source_aliases text[] not null default '{}',
  source_folder text not null,
  sender text not null,
  subject text not null,
  received_at timestamptz not null,
  body_text text not null,
  extracted_text text not null default '',
  account_number text check(account_number ~ '^[0-9]{10}$'),
  payment_date date,
  amount numeric(12,2) check(amount >= 0),
  receipt_number text,
  invoice_references text[] not null default '{}',
  confirmed boolean not null default false,
  invoice_id uuid references public.unifi_invoices(id),
  match_method text check(match_method in ('auto','manual')),
  matched_by uuid references public.profiles(id),
  matched_at timestamptz,
  content_hash text not null unique check(content_hash ~ '^[a-f0-9]{64}$'),
  email_path text not null,
  attachments jsonb not null default '[]' check(jsonb_typeof(attachments)='array'),
  created_at timestamptz not null default now(),
  check((invoice_id is null) = (matched_at is null)),
  check((invoice_id is null) = (match_method is null))
);
create index unifi_payment_receipts_invoice on public.unifi_payment_receipts(invoice_id);
alter table public.unifi_payment_receipts enable row level security;
revoke all on public.unifi_payment_receipts from public,anon,authenticated;
grant select,insert,update on public.unifi_payment_receipts to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('unifi-payment-receipts','unifi-payment-receipts',false,16777216,
  array['application/pdf','image/png','image/jpeg','message/rfc822']);

alter table public.unifi_webmail_connection
  add column receipt_checked_at timestamptz,
  add column receipt_last_error text,
  add column checked_folders text[] not null default '{}';

create table public.unifi_payment_reminders (
  invoice_id uuid primary key references public.unifi_invoices(id),
  created_at timestamptz not null default now()
);
alter table public.unifi_payment_reminders enable row level security;
revoke all on public.unifi_payment_reminders from public,anon,authenticated;
grant select,insert on public.unifi_payment_reminders to service_role;

create function public.queue_unifi_payment_checks() returns integer
language plpgsql security invoker set search_path='' as $$
declare queued integer;
begin
  update public.app_notifications n set read_at=coalesce(n.read_at,now())
  where n.type='unifi_payment_receipt_followup' and n.read_at is null
    and exists(select 1 from public.unifi_payment_receipts r where r.invoice_id=n.entity_id);
  with due as (
    insert into public.unifi_payment_reminders(invoice_id)
    select i.id from public.unifi_invoices i
    where i.period>='2026-11' and i.due_date <= (now() at time zone 'Asia/Kuala_Lumpur')::date+7
      and not exists(select 1 from public.unifi_payment_receipts r where r.invoice_id=i.id)
    on conflict(invoice_id) do nothing returning invoice_id
  ), notices as (
    insert into public.app_notifications(id,recipient_id,type,title,body,href,entity_id)
    select gen_random_uuid(),p.id,'unifi_payment_receipt_followup','TM Unifi payment receipt check',
      'Account '||coalesce(i.account_number,'-')||' · '||i.period||' · Due '||to_char(i.due_date,'DD/MM/YYYY')||'. No matched payment receipt has been received. Please follow up.',
      '/admin/unifi-invoices/'||i.id::text||'#unifi-payment-receipts',i.id
    from due d join public.unifi_invoices i on i.id=d.invoice_id
    cross join public.profiles p where p.role::text='admin' and p.is_active and p.deleted_at is null
    returning id
  ) select count(*) into queued from notices;
  return queued;
end;
$$;
revoke all on function public.queue_unifi_payment_checks() from public,anon,authenticated;
grant execute on function public.queue_unifi_payment_checks() to service_role;
