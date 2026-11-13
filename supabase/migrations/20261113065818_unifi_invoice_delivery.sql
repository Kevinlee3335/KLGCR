create table public.unifi_invoice_delivery (
  invoice_id uuid primary key references public.unifi_invoices(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'uncertain')),
  attempted_at timestamptz,
  sent_at timestamptz,
  error text,
  claim_token uuid,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'sent') = (sent_at is not null)),
  check ((status = 'sending') = (claim_token is not null)),
  check ((status = 'sending') = (locked_until is not null))
);

alter table public.unifi_invoice_delivery enable row level security;
revoke all on public.unifi_invoice_delivery from public, anon, authenticated, service_role;
grant select on public.unifi_invoice_delivery to service_role;
grant insert(invoice_id), update(status, attempted_at, sent_at, error, claim_token, locked_until)
  on public.unifi_invoice_delivery to service_role;

create index unifi_invoice_delivery_retry_queue
  on public.unifi_invoice_delivery (created_at)
  where status in ('pending', 'failed', 'uncertain', 'sending');

create function public.queue_unifi_invoice_delivery()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.review_stage = 'approved' and new.james_approved_at is not null then
    insert into public.unifi_invoice_delivery(invoice_id) values (new.id)
    on conflict (invoice_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.queue_unifi_invoice_delivery() from public, anon, authenticated;
grant execute on function public.queue_unifi_invoice_delivery() to service_role;

create trigger unifi_invoice_approval_queues_delivery
  after insert or update of review_stage on public.unifi_invoices
  for each row execute function public.queue_unifi_invoice_delivery();

insert into public.unifi_invoice_delivery(invoice_id)
select id from public.unifi_invoices
where review_stage = 'approved' and james_approved_at is not null
on conflict (invoice_id) do nothing;

create function public.claim_unifi_invoice_delivery(p_invoice_id uuid, p_claim_token uuid)
returns text language sql security invoker set search_path = '' as $$
  with eligible as (
    select d.invoice_id, d.status
    from public.unifi_invoice_delivery d
    join public.unifi_invoices i on i.id = d.invoice_id
    where d.invoice_id = p_invoice_id and p_claim_token is not null
      and i.review_stage = 'approved' and i.james_approved_at is not null
      and (d.status in ('pending', 'failed', 'uncertain')
        or (d.status = 'sending' and d.locked_until <= now()))
    for update of d skip locked
  )
  update public.unifi_invoice_delivery d
  set status = 'sending', attempted_at = now(),
      claim_token = p_claim_token, locked_until = now() + interval '2 minutes'
  from eligible e
  where d.invoice_id = e.invoice_id
  returning e.status;
$$;

revoke all on function public.claim_unifi_invoice_delivery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_unifi_invoice_delivery(uuid, uuid) to service_role;
