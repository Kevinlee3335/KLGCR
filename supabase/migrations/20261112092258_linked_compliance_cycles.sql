-- Keep the existing compliance record IDs and their last recorded completion dates.
alter table public.compliance_records
  drop constraint compliance_records_record_type_check,
  add constraint compliance_records_record_type_check
    check (record_type in ('certificate_license', 'servicing', 'agreement')),
  alter column next_due_date drop not null,
  add column location text,
  add column supplier_key text references public.supplier_mail_suppliers(id),
  add column template_row integer check (template_row > 0),
  add column required_evidence text[] not null default '{}';

update public.compliance_records set required_evidence = array['certificate']
where record_type = 'certificate_license';

alter table public.compliance_records add constraint compliance_records_required_evidence_check check (
  required_evidence <@ array['invoice', 'service_report', 'certificate', 'agreement']::text[]
  and array_position(required_evidence, null) is null
  and (record_type <> 'agreement' or 'agreement' = any(required_evidence))
);

create table public.compliance_cycles (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.compliance_records(id),
  status text not null default 'open' check (status in ('open', 'completed')),
  original_due_date date,
  due_date date,
  effective_date date,
  performed_on date,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  next_due_date date,
  next_effective_date date,
  requires_invoice boolean not null default false,
  required_evidence text[],
  notes text,
  template_row integer check (template_row > 0),
  created_at timestamptz not null default now(),
  check (effective_date is null or due_date is null or effective_date <= due_date),
  check (next_effective_date is null or next_due_date is null or next_effective_date <= next_due_date),
  check (
    (status = 'open' and completed_at is null and completed_by is null
      and next_due_date is null and next_effective_date is null and required_evidence is null)
    or (status = 'completed' and performed_on is not null and completed_at is not null and completed_by is not null
      and required_evidence is not null)
  )
);

create unique index compliance_cycles_one_open on public.compliance_cycles(record_id) where status = 'open';
create index compliance_cycles_history on public.compliance_cycles(record_id, created_at desc);
create index compliance_cycles_open_due on public.compliance_cycles(due_date) where status = 'open';

insert into public.compliance_cycles(record_id, original_due_date, due_date, created_at)
select id, next_due_date, next_due_date, created_at
from public.compliance_records
where status <> 'completed';

create table public.compliance_cycle_documents (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.compliance_cycles(id),
  kind text not null check (kind in ('quotation', 'invoice', 'service_report', 'certificate', 'agreement')),
  source text not null check (source in ('supplier_email', 'upload')),
  supplier_document_id uuid references public.supplier_mail_documents(id),
  source_message_id text references public.supplier_emails(id),
  storage_path text not null,
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  review_stage text not null,
  fikri_verified_at timestamptz,
  fikri_verified_by uuid references public.profiles(id),
  kevin_verified_at timestamptz,
  kevin_verified_by uuid references public.profiles(id),
  james_approved_at timestamptz,
  james_approved_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (cycle_id, kind, sha256),
  check (
    (source = 'supplier_email' and supplier_document_id is not null and source_message_id is not null)
    or (source = 'upload' and supplier_document_id is null and source_message_id is null)
  ),
  check (
    (kind in ('quotation', 'invoice') and review_stage in ('fikri', 'kevin', 'james', 'approved'))
    or (kind = 'service_report' and review_stage in ('fikri', 'kevin', 'verified'))
    or (kind in ('certificate', 'agreement') and review_stage = 'filed')
  ),
  check ((fikri_verified_at is not null and fikri_verified_by is not null) = (review_stage in ('kevin', 'james', 'verified', 'approved'))),
  check ((kevin_verified_at is not null and kevin_verified_by is not null) = (review_stage in ('james', 'verified', 'approved'))),
  check ((james_approved_at is not null and james_approved_by is not null) = (review_stage = 'approved'))
);

create index compliance_cycle_documents_source on public.compliance_cycle_documents(supplier_document_id)
where supplier_document_id is not null;

alter table public.compliance_cycles enable row level security;
alter table public.compliance_cycle_documents enable row level security;

-- Old browser writes could set Completed or change the due date independently of the cycle.
-- The application now uses service-role RPCs which validate the signed-in admin and update both rows.
revoke insert, update, delete on public.compliance_records from public, anon, authenticated;
revoke all on public.compliance_cycles, public.compliance_cycle_documents from public, anon, authenticated;
grant select on public.compliance_records, public.compliance_cycles, public.compliance_cycle_documents to authenticated;
grant select, insert, update on public.compliance_records, public.compliance_cycles, public.compliance_cycle_documents to service_role;

create policy "management reads compliance cycles" on public.compliance_cycles
  for select to authenticated using (public.is_management());
create policy "management reads compliance cycle documents" on public.compliance_cycle_documents
  for select to authenticated using (public.is_management());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('compliance-documents', 'compliance-documents', false, 52428800, array['application/pdf']);

create policy "management reads private compliance PDFs" on storage.objects
  for select to authenticated using (bucket_id = 'compliance-documents' and public.is_management());

create function public.compliance_admin_username(p_actor_id uuid)
returns text language sql stable security invoker set search_path = '' as $$
  select username from public.profiles
  where id = p_actor_id and role = 'admin' and is_active and deleted_at is null;
$$;
revoke all on function public.compliance_admin_username(uuid) from public, anon, authenticated;
grant execute on function public.compliance_admin_username(uuid) to service_role;

create function public.save_compliance_record(p_actor_id uuid, p_record_id uuid, p_record jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_record public.compliance_records%rowtype;
  v_cycle public.compliance_cycles%rowtype;
  v_values jsonb;
  v_title text;
  v_type text;
  v_status text;
  v_supplier text;
  v_due date;
  v_effective date;
  v_required text[];
  v_template_row integer;
  v_cycle_template_row integer;
  v_open boolean;
begin
  if public.compliance_admin_username(p_actor_id) is null then raise exception 'Admin account required'; end if;
  if jsonb_typeof(p_record) is distinct from 'object' then raise exception 'Enter valid compliance record details'; end if;

  if p_record_id is not null then
    select * into v_record from public.compliance_records where id = p_record_id for update;
    if not found then raise exception 'Compliance record not found'; end if;
    select * into v_cycle from public.compliance_cycles where record_id = p_record_id and status = 'open' for update;
  end if;

  v_values := coalesce(to_jsonb(v_record), '{}'::jsonb) || p_record;
  v_title := nullif(btrim(v_values->>'title'), '');
  v_type := v_values->>'record_type';
  v_due := nullif(v_values->>'next_due_date', '')::date;
  v_effective := case when p_record ? 'effective_date' then nullif(p_record->>'effective_date', '')::date else v_cycle.effective_date end;
  v_supplier := nullif(btrim(v_values->>'supplier_key'), '');
  v_template_row := nullif(v_values->>'template_row', '')::integer;
  v_cycle_template_row := case when p_record ? 'cycle_template_row' then nullif(p_record->>'cycle_template_row', '')::integer else v_cycle.template_row end;

  if v_title is null or v_type is null or v_type not in ('certificate_license', 'servicing', 'agreement') then
    raise exception 'Enter a valid compliance title and type';
  end if;
  if v_effective > v_due then raise exception 'Effective date cannot be after the due date'; end if;
  if p_record ? 'status' and (p_record->>'status' is null or p_record->>'status' not in ('active', 'renewal_in_progress', 'expired')) then
    raise exception 'Use Complete cycle to record a completion';
  end if;

  if p_record ? 'required_evidence' then
    if jsonb_typeof(p_record->'required_evidence') is distinct from 'array' then raise exception 'Select valid evidence types'; end if;
    select coalesce(array_agg(distinct evidence order by evidence), '{}') into v_required
    from jsonb_array_elements_text(p_record->'required_evidence') as requirements(evidence);
  elsif v_record.record_type = v_type then
    v_required := v_record.required_evidence;
  else
    v_required := case v_type when 'agreement' then array['agreement'] when 'certificate_license' then array['certificate']
      else case when v_supplier is null then '{}'::text[] else array['service_report'] end end;
  end if;
  if not (v_required <@ array['invoice', 'service_report', 'certificate', 'agreement']::text[])
    or array_position(v_required, null) is not null then raise exception 'Select valid evidence types'; end if;
  if v_type = 'agreement' and not ('agreement' = any(v_required)) then raise exception 'Agreement renewal requires the signed agreement'; end if;

  v_open := v_record.id is null or v_cycle.id is not null or (p_record ? 'next_due_date' and v_due is not null)
    or (p_record ? 'effective_date' and v_effective is not null);
  v_status := case when v_open then coalesce(p_record->>'status', nullif(v_record.status, 'completed'), 'active') else 'completed' end;
  if v_record.id is null then
    insert into public.compliance_records(record_type, title, provider, reference_no, next_due_date, status, notes,
      frequency, contact_name, contact_phone, contact_email, location, supplier_key, required_evidence, template_row, created_by)
    values (v_type, v_title, nullif(btrim(v_values->>'provider'), ''), nullif(btrim(v_values->>'reference_no'), ''), v_due, v_status,
      nullif(btrim(v_values->>'notes'), ''), nullif(btrim(v_values->>'frequency'), ''), nullif(btrim(v_values->>'contact_name'), ''),
      nullif(btrim(v_values->>'contact_phone'), ''), nullif(btrim(v_values->>'contact_email'), ''), nullif(btrim(v_values->>'location'), ''),
      v_supplier, v_required, v_template_row, p_actor_id)
    returning id into p_record_id;
  else
    update public.compliance_records set record_type = v_type, title = v_title, provider = nullif(btrim(v_values->>'provider'), ''),
      reference_no = nullif(btrim(v_values->>'reference_no'), ''), next_due_date = v_due, status = v_status,
      notes = nullif(btrim(v_values->>'notes'), ''), frequency = nullif(btrim(v_values->>'frequency'), ''),
      contact_name = nullif(btrim(v_values->>'contact_name'), ''), contact_phone = nullif(btrim(v_values->>'contact_phone'), ''),
      contact_email = nullif(btrim(v_values->>'contact_email'), ''), location = nullif(btrim(v_values->>'location'), ''),
      supplier_key = v_supplier, required_evidence = v_required, template_row = v_template_row, updated_at = now()
    where id = p_record_id;
  end if;

  if v_cycle.id is not null then
    update public.compliance_cycles set due_date = v_due, effective_date = v_effective, template_row = v_cycle_template_row
    where id = v_cycle.id;
  elsif v_open then
    insert into public.compliance_cycles(record_id, original_due_date, due_date, effective_date, template_row)
    values (p_record_id, v_due, v_due, v_effective, v_cycle_template_row);
  end if;
  return p_record_id;
end;
$$;
revoke all on function public.save_compliance_record(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_compliance_record(uuid, uuid, jsonb) to service_role;

create function public.attach_compliance_document(p_actor_id uuid, p_cycle_id uuid, p_kind text,
  p_supplier_document_id uuid, p_storage_path text, p_file_name text, p_sha256 text, p_size_bytes bigint,
  p_source_message_id text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_cycle public.compliance_cycles%rowtype;
  v_supplier text;
  v_archived public.supplier_mail_documents%rowtype;
  v_message_id text;
  v_folder text;
  v_source text;
  v_stage text;
  v_id uuid;
begin
  if public.compliance_admin_username(p_actor_id) is null then raise exception 'Admin account required'; end if;
  if p_kind is null or p_kind not in ('quotation', 'invoice', 'service_report', 'certificate', 'agreement') then
    raise exception 'Choose a valid document type';
  end if;

  select * into v_cycle from public.compliance_cycles where id = p_cycle_id for update;
  if not found or v_cycle.status <> 'open' then raise exception 'The compliance cycle is closed or unavailable'; end if;

  if p_supplier_document_id is not null then
    select * into v_archived from public.supplier_mail_documents where id = p_supplier_document_id;
    if not found then raise exception 'Supplier document not found'; end if;
    select supplier_key into v_supplier from public.compliance_records where id = v_cycle.record_id;
    if v_supplier is not null and v_supplier <> v_archived.company then raise exception 'This document belongs to another supplier'; end if;
    v_folder := case p_kind when 'quotation' then 'Quotation' when 'invoice' then 'Invoice'
      when 'service_report' then 'Service Report' when 'agreement' then 'Agreement' else 'Other Documents' end;
    if v_archived.folder not in (v_folder, 'Other Documents') then raise exception 'The supplier document has a different type'; end if;

    select a.message_id into v_message_id
    from public.supplier_mail_attachments a join public.supplier_emails e on e.id = a.message_id
    where a.document_id = p_supplier_document_id and a.issue is null and e.company = v_archived.company
      and (p_source_message_id is null or a.message_id = p_source_message_id)
    order by e.received_at desc, e.id desc limit 1;
    if v_message_id is null then raise exception 'Original supplier email not found for this PDF'; end if;

    v_source := 'supplier_email';
    p_file_name := v_archived.file_name;
    p_storage_path := v_archived.storage_path;
    p_sha256 := v_archived.content_hash;
    p_size_bytes := v_archived.size_bytes;
  else
    v_source := 'upload';
    p_file_name := nullif(btrim(p_file_name), '');
    if p_source_message_id is not null or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_file_name is null or p_file_name !~* '\.pdf$'
      or p_size_bytes is null or p_size_bytes not between 1 and 52428800
      or p_storage_path is distinct from (p_cycle_id::text || '/' || p_sha256 || '.pdf')
      or not exists (select 1 from storage.objects where bucket_id = 'compliance-documents' and name = p_storage_path) then
      raise exception 'Upload a valid PDF before attaching it';
    end if;
  end if;

  v_stage := case when p_kind in ('quotation', 'invoice', 'service_report') then 'fikri' else 'filed' end;
  insert into public.compliance_cycle_documents(cycle_id, kind, source, supplier_document_id, source_message_id, storage_path,
    file_name, sha256, size_bytes, review_stage, created_by)
  values (p_cycle_id, p_kind, v_source, p_supplier_document_id, v_message_id, p_storage_path,
    p_file_name, p_sha256, p_size_bytes, v_stage, p_actor_id)
  on conflict (cycle_id, kind, sha256) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.compliance_cycle_documents where cycle_id = p_cycle_id and kind = p_kind and sha256 = p_sha256;
  end if;
  return v_id;
end;
$$;
revoke all on function public.attach_compliance_document(uuid, uuid, text, uuid, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.attach_compliance_document(uuid, uuid, text, uuid, text, text, text, bigint, text) to service_role;

create function public.advance_compliance_document_review(p_actor_id uuid, p_document_id uuid, p_expected_stage text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_document public.compliance_cycle_documents%rowtype;
  v_next text;
begin
  if public.compliance_admin_username(p_actor_id) is null then raise exception 'Admin account required'; end if;
  select * into v_document from public.compliance_cycle_documents where id = p_document_id for update;
  if not found then raise exception 'Compliance document not found'; end if;
  if v_document.review_stage is distinct from p_expected_stage then raise exception 'Review stage has changed'; end if;

  if p_expected_stage = 'fikri' and p_actor_id = 'a21286a7-56fd-48e4-9571-ffeacf825692' then
    v_next := 'kevin';
    update public.compliance_cycle_documents set review_stage = v_next, fikri_verified_at = now(), fikri_verified_by = p_actor_id
    where id = p_document_id;
  elsif p_expected_stage = 'kevin' and p_actor_id = '7a40e00f-2e95-4c27-83d9-0f7dba788b77' then
    v_next := case when v_document.kind = 'service_report' then 'verified' else 'james' end;
    update public.compliance_cycle_documents set review_stage = v_next, kevin_verified_at = now(), kevin_verified_by = p_actor_id
    where id = p_document_id;
  elsif p_expected_stage = 'james' and p_actor_id = 'eeab5f04-30c3-42bd-a095-58e56c814358' then
    v_next := 'approved';
    update public.compliance_cycle_documents set review_stage = v_next, james_approved_at = now(), james_approved_by = p_actor_id
    where id = p_document_id;
  else
    raise exception 'This document is awaiting another reviewer';
  end if;
  return v_next;
end;
$$;
revoke all on function public.advance_compliance_document_review(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.advance_compliance_document_review(uuid, uuid, text) to service_role;

create function public.update_compliance_cycle_progress(p_actor_id uuid, p_cycle_id uuid, p_performed_on date, p_notes text,
  p_requires_invoice boolean default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
begin
  if public.compliance_admin_username(p_actor_id) is null then raise exception 'Admin account required'; end if;
  if p_performed_on > (now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'Enter the actual work or return date'; end if;
  update public.compliance_cycles set performed_on = p_performed_on, notes = nullif(btrim(p_notes), ''),
    requires_invoice = coalesce(p_requires_invoice, requires_invoice)
  where id = p_cycle_id and status = 'open';
  if not found then raise exception 'The compliance cycle is closed or unavailable'; end if;
  return p_cycle_id;
end;
$$;
revoke all on function public.update_compliance_cycle_progress(uuid, uuid, date, text, boolean) from public, anon, authenticated;
grant execute on function public.update_compliance_cycle_progress(uuid, uuid, date, text, boolean) to service_role;

create function public.complete_compliance_cycle(p_actor_id uuid, p_cycle_id uuid, p_performed_on date,
  p_next_due_date date, p_next_effective_date date, p_notes text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_record public.compliance_records%rowtype;
  v_cycle public.compliance_cycles%rowtype;
  v_record_id uuid;
  v_next_id uuid;
  v_required text[];
  v_missing text[];
begin
  if public.compliance_admin_username(p_actor_id) is null then raise exception 'Admin account required'; end if;
  select record_id into v_record_id from public.compliance_cycles where id = p_cycle_id;
  if not found then raise exception 'Compliance cycle not found'; end if;
  select * into v_record from public.compliance_records where id = v_record_id for update;
  select * into v_cycle from public.compliance_cycles where id = p_cycle_id for update;
  if v_cycle.status <> 'open' then raise exception 'This compliance cycle is already completed'; end if;

  p_performed_on := coalesce(p_performed_on, v_cycle.performed_on);
  if p_performed_on is null or p_performed_on > (now() at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Enter the actual completion date';
  end if;
  if p_next_due_date is not null and (p_next_due_date <= p_performed_on or p_next_due_date <= v_cycle.due_date) then
    raise exception 'The next due date must be after this cycle';
  end if;
  if p_next_effective_date > p_next_due_date then raise exception 'The next effective date cannot be after the next due date'; end if;

  v_required := v_record.required_evidence;
  if v_cycle.requires_invoice and not ('invoice' = any(v_required)) then
    v_required := array_append(v_required, 'invoice');
  end if;
  select array_agg(required.kind order by required.kind) into v_missing
  from unnest(v_required) required(kind)
  where not exists (
    select 1 from public.compliance_cycle_documents d
    where d.cycle_id = p_cycle_id and d.kind = required.kind and d.review_stage in ('approved', 'verified', 'filed')
  );
  if v_missing is not null then raise exception 'Required documents are missing or awaiting review: %', array_to_string(v_missing, ', '); end if;

  update public.compliance_cycles set status = 'completed', performed_on = p_performed_on, completed_at = now(), completed_by = p_actor_id,
    next_due_date = p_next_due_date, next_effective_date = p_next_effective_date, required_evidence = v_required,
    notes = coalesce(nullif(btrim(p_notes), ''), v_cycle.notes)
  where id = p_cycle_id;

  if p_next_due_date is not null or p_next_effective_date is not null then
    insert into public.compliance_cycles(record_id, original_due_date, due_date, effective_date)
    values (v_record_id, p_next_due_date, p_next_due_date, p_next_effective_date) returning id into v_next_id;
  end if;

  update public.compliance_records set status = case when v_next_id is not null then 'active' else 'completed' end,
    last_completed_date = p_performed_on, next_due_date = p_next_due_date, updated_at = now()
  where id = v_record_id;
  return v_next_id;
end;
$$;
revoke all on function public.complete_compliance_cycle(uuid, uuid, date, date, date, text) from public, anon, authenticated;
grant execute on function public.complete_compliance_cycle(uuid, uuid, date, date, date, text) to service_role;
