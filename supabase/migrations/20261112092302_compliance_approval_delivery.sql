create table public.compliance_document_delivery (
  document_id uuid primary key references public.compliance_cycle_documents(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','blocked','failed','uncertain')),
  recipient text,
  attempted_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  check (status <> 'sent' or (recipient is not null and sent_at is not null))
);

alter table public.compliance_document_delivery enable row level security;
revoke all on public.compliance_document_delivery from public, anon, authenticated, service_role;
grant select on public.compliance_document_delivery to authenticated, service_role;
grant insert(document_id), update(status, recipient, attempted_at, sent_at, error)
  on public.compliance_document_delivery to service_role;

create policy "management reads compliance delivery status"
  on public.compliance_document_delivery for select to authenticated using(public.is_management());

create index compliance_document_delivery_queue
  on public.compliance_document_delivery (status, created_at)
  where status in ('pending','sending');

create function public.queue_compliance_document_delivery()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.review_stage = 'approved' and new.kind in ('quotation','invoice') then
    insert into public.compliance_document_delivery(document_id) values (new.id)
    on conflict (document_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.queue_compliance_document_delivery() from public, anon, authenticated;
grant execute on function public.queue_compliance_document_delivery() to service_role;

create trigger compliance_document_approval_queues_email
  after insert or update of review_stage on public.compliance_cycle_documents
  for each row execute function public.queue_compliance_document_delivery();
