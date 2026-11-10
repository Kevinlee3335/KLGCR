create table public.billing_customer_invoice_packages (
  id uuid primary key,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  company_name text not null,
  recipient text not null check (recipient = lower(btrim(recipient)) and recipient ~ '^[^[:space:]@,;]+@[^[:space:]@,;]+\.[^[:space:]@,;]+$'),
  rental_run_id uuid references public.billing_run_approvals(run_id),
  rental_line_index integer check (rental_line_index >= 0),
  rental_account_key text,
  rental_invoice_no text,
  utility_run_id uuid references public.billing_run_approvals(run_id),
  utility_line_index integer check (utility_line_index >= 0),
  utility_account_key text,
  utility_invoice_no text,
  file_name text not null,
  page_count integer not null check (page_count > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  attempted_at timestamptz,
  sent_at timestamptz,
  delivery_error text,
  status text not null default 'draft' check (status in ('draft','sending','delivery_pending','sent')),
  check (num_nonnulls(rental_run_id,rental_line_index,rental_account_key) in (0,3)),
  check (num_nonnulls(utility_run_id,utility_line_index,utility_account_key) in (0,3)),
  check (num_nonnulls(rental_run_id,utility_run_id) > 0),
  check (rental_invoice_no is null or (rental_run_id is not null and length(rental_invoice_no) between 1 and 70)),
  check (utility_invoice_no is null or (utility_run_id is not null and length(utility_invoice_no) between 1 and 70)),
  unique (rental_run_id,rental_line_index),
  unique (utility_run_id,utility_line_index)
);
create index billing_customer_invoice_period on public.billing_customer_invoice_packages(period, created_at desc);
create table public.billing_customer_invoice_pages (
  package_id uuid not null references public.billing_customer_invoice_packages(id) on delete cascade,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  page_number integer not null check (page_number > 0),
  primary key (source_hash,page_number)
);
create index billing_customer_invoice_pages_package on public.billing_customer_invoice_pages(package_id);

alter table public.billing_customer_invoice_packages enable row level security;
alter table public.billing_customer_invoice_pages enable row level security;
revoke all on public.billing_customer_invoice_packages,public.billing_customer_invoice_pages from public,anon,authenticated;
grant select,insert,update,delete on public.billing_customer_invoice_packages,public.billing_customer_invoice_pages to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('billing-customer-invoices','billing-customer-invoices',false,11000000,array['application/pdf'])
on conflict (id) do nothing;

create function public.create_billing_customer_invoice_package(p_package jsonb, p_pages jsonb)
returns public.billing_customer_invoice_packages language plpgsql security invoker set search_path='' as $$
declare package public.billing_customer_invoice_packages;
begin
  insert into public.billing_customer_invoice_packages (
    id, period, company_name, recipient, rental_run_id, rental_line_index, rental_account_key, rental_invoice_no,
    utility_run_id, utility_line_index, utility_account_key, utility_invoice_no, file_name, page_count, created_by
  ) select p.id,p.period,p.company_name,p.recipient,p.rental_run_id,p.rental_line_index,p.rental_account_key,p.rental_invoice_no,
    p.utility_run_id,p.utility_line_index,p.utility_account_key,p.utility_invoice_no,p.file_name,p.page_count,p.created_by
  from jsonb_populate_record(null::public.billing_customer_invoice_packages,p_package) p returning * into package;

  insert into public.billing_customer_invoice_pages(package_id,source_hash,page_number)
  select package.id,p.source_hash,p.page_number from jsonb_to_recordset(p_pages) p(source_hash text,page_number integer);
  return package;
end $$;
revoke all on function public.create_billing_customer_invoice_package(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_billing_customer_invoice_package(jsonb,jsonb) to service_role;

create function public.claim_billing_customer_invoice_delivery(p_id uuid, p_admin uuid)
returns public.billing_customer_invoice_packages language plpgsql security invoker set search_path='' as $$
declare package public.billing_customer_invoice_packages;
declare account record;
declare registered_email text;
begin
  if not exists(select 1 from public.profiles p where p.id=p_admin and p.role='admin' and p.is_active and p.deleted_at is null) then
    raise exception 'Active administrator required';
  end if;
  select * into package from public.billing_customer_invoice_packages p where p.id=p_id for update;
  if not found then raise exception 'Package not found'; end if;
  if package.status='sent' or (package.status='sending' and package.attempted_at > now()-interval '2 minutes') then
    return null;
  end if;
  for account in
    select a.kind,a.account_key from (values ('rental',package.rental_account_key),('utility',package.utility_account_key)) a(kind,account_key)
    where a.account_key is not null order by a.kind,a.account_key
  loop
    if package.status='draft' then
      insert into public.billing_payment_contacts(kind,account_key,email) values(account.kind,account.account_key,package.recipient)
      on conflict (kind,account_key) do nothing;
    end if;
    select lower(btrim(c.email)) into registered_email from public.billing_payment_contacts c
    where c.kind=account.kind and c.account_key=account.account_key for update;
    if registered_email is distinct from package.recipient then raise exception 'Registered customer email changed'; end if;
  end loop;
  update public.billing_customer_invoice_packages p set status='sending',attempted_at=now(),
    confirmed_by=coalesce(confirmed_by,p_admin),confirmed_at=coalesce(confirmed_at,now()),delivery_error=null
  where p.id=p_id returning * into package;
  return package;
end $$;
revoke all on function public.claim_billing_customer_invoice_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_billing_customer_invoice_delivery(uuid,uuid) to service_role;
