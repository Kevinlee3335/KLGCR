alter table public.compliance_cycle_documents
  drop constraint compliance_cycle_documents_check1,
  drop constraint compliance_cycle_documents_check2,
  drop constraint compliance_cycle_documents_check3;
alter table public.unifi_invoices
  drop constraint unifi_invoices_review_stage_check,
  drop constraint unifi_invoices_check3,
  drop constraint unifi_invoices_check4,
  alter column review_stage set default 'verification';

-- 'fikri' now means only Fikri's signature is missing. Existing unsigned
-- rows enter the shared queue; completed rows and signatures are preserved.
alter table public.compliance_cycle_documents disable trigger compliance_document_review_push;
alter table public.unifi_invoices disable trigger unifi_invoice_review_push;
update public.compliance_cycle_documents set review_stage = 'verification' where review_stage = 'fikri';
update public.unifi_invoices set review_stage = 'verification' where review_stage = 'fikri';
alter table public.compliance_cycle_documents enable trigger compliance_document_review_push;
alter table public.unifi_invoices enable trigger unifi_invoice_review_push;

alter table public.compliance_cycle_documents
  add constraint compliance_document_review_stage_check check (
    (kind in ('quotation', 'invoice') and review_stage in ('verification', 'fikri', 'kevin', 'james', 'approved'))
    or (kind = 'service_report' and review_stage in ('verification', 'fikri', 'kevin', 'verified'))
    or (kind in ('certificate', 'agreement') and review_stage = 'filed')
  ),
  add constraint compliance_document_fikri_signature_check check (
    (fikri_verified_at is null) = (fikri_verified_by is null)
    and (fikri_verified_at is not null) = (review_stage in ('kevin', 'james', 'verified', 'approved'))
  ),
  add constraint compliance_document_kevin_signature_check check (
    (kevin_verified_at is null) = (kevin_verified_by is null)
    and (kevin_verified_at is not null) = (review_stage in ('fikri', 'james', 'verified', 'approved'))
  );
alter table public.unifi_invoices
  add constraint unifi_invoices_review_stage_check check (
    review_stage in ('verification', 'fikri', 'kevin', 'james', 'approved', 'archived')
  ),
  add constraint unifi_invoices_fikri_signature_check check (
    (fikri_verified_at is not null) = (review_stage in ('kevin', 'james', 'approved'))
  ),
  add constraint unifi_invoices_kevin_signature_check check (
    (kevin_verified_at is not null) = (review_stage in ('fikri', 'james', 'approved'))
  );

create or replace function public.verify_document(p_type text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  audit jsonb;
  actor uuid := auth.uid();
  stamp jsonb;
  actor_name text;
begin
  if p_type is null or p_type not in ('billing', 'gym') or p_id is null then raise exception 'Invalid document'; end if;
  if actor is null or actor not in (public.compliance_review_recipient('fikri'), public.compliance_review_recipient('kevin'))
    or not exists (select 1 from public.profiles where id = actor and is_active and deleted_at is null and role::text = 'admin')
  then raise exception 'Only Fikri or Kevin can verify this document'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_type || p_id::text, 0));
  if p_type = 'billing' then
    if not exists (select 1 from public.billing_preview_runs where id = p_id)
      or exists (select 1 from public.billing_run_approvals where run_id = p_id)
    then raise exception 'Document unavailable or already approved'; end if;
  elsif not exists (select 1 from public.gym_monthly_approvals where id = p_id and approved_at is null) then
    raise exception 'Document unavailable or already approved';
  end if;

  select entries into audit from public.document_verifications where document_type = p_type and document_id = p_id;
  audit := coalesce(audit, '[]'::jsonb);
  if audit @> jsonb_build_array(jsonb_build_object('user_id', actor)) then return audit; end if;
  select s.signature, p.full_name into stamp, actor_name
  from public.user_e_signatures s join public.profiles p on p.id = s.user_id where s.user_id = actor;
  if stamp is null then raise exception 'Save your personal E-signature before verifying'; end if;

  audit := audit || jsonb_build_array(jsonb_build_object('user_id', actor, 'name', actor_name, 'verified_at', clock_timestamp(), 'signature', stamp));
  insert into public.document_verifications(document_type, document_id, entries) values (p_type, p_id, audit)
  on conflict (document_type, document_id) do update set entries = excluded.entries;
  return audit;
end;
$$;

create or replace function public.require_document_verifications() returns trigger
language plpgsql security definer set search_path = '' as $$
declare audit jsonb; dtype text; did uuid;
begin
  if tg_table_name = 'gym_monthly_approvals' then
    if new.approved_at is null or (tg_op = 'UPDATE' and old.approved_at is not null) then return new; end if;
    dtype := 'gym';
    did := new.id;
  else
    dtype := 'billing';
    did := new.run_id;
  end if;
  select entries into audit from public.document_verifications where document_type = dtype and document_id = did;
  if audit is null or not audit @> jsonb_build_array(
    jsonb_build_object('user_id', public.compliance_review_recipient('fikri')),
    jsonb_build_object('user_id', public.compliance_review_recipient('kevin'))
  ) then raise exception 'Fikri and Kevin must verify this document before James can approve'; end if;
  new.verifications := audit;
  return new;
end;
$$;

create or replace function public.attach_compliance_document(p_actor_id uuid, p_cycle_id uuid, p_kind text,
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

  v_stage := case when p_kind in ('quotation', 'invoice', 'service_report') then 'verification' else 'filed' end;
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
create or replace function public.advance_compliance_document_review(p_actor_id uuid, p_document_id uuid, p_expected_stage text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  doc public.compliance_cycle_documents%rowtype;
  next_stage text;
begin
  if public.compliance_admin_username(p_actor_id) is null
    or public.compliance_review_recipient(p_expected_stage) is distinct from p_actor_id
  then raise exception 'This document is awaiting another reviewer'; end if;

  select * into doc from public.compliance_cycle_documents where id = p_document_id for update;
  if not found then raise exception 'Compliance document not found'; end if;
  if p_expected_stage = 'james' and doc.review_stage = 'james' then
    next_stage := 'approved';
  elsif p_expected_stage in ('fikri', 'kevin') and doc.review_stage in ('verification', 'fikri', 'kevin') then
    if doc.review_stage not in ('verification', p_expected_stage) then return doc.review_stage; end if;
    next_stage := case
      when doc.review_stage <> 'verification' then case when doc.kind = 'service_report' then 'verified' else 'james' end
      when p_expected_stage = 'fikri' then 'kevin'
      else 'fikri'
    end;
  else
    raise exception 'Review stage has changed';
  end if;

  update public.compliance_cycle_documents set
    review_stage = next_stage,
    fikri_verified_at = case when p_expected_stage = 'fikri' then clock_timestamp() else fikri_verified_at end,
    fikri_verified_by = case when p_expected_stage = 'fikri' then p_actor_id else fikri_verified_by end,
    kevin_verified_at = case when p_expected_stage = 'kevin' then clock_timestamp() else kevin_verified_at end,
    kevin_verified_by = case when p_expected_stage = 'kevin' then p_actor_id else kevin_verified_by end,
    james_approved_at = case when p_expected_stage = 'james' then clock_timestamp() else james_approved_at end,
    james_approved_by = case when p_expected_stage = 'james' then p_actor_id else james_approved_by end
  where id = p_document_id;
  return next_stage;
end;
$$;

create or replace function public.advance_unifi_invoice_review(p_invoice_id uuid, p_expected_stage text, p_actor_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  current_stage text;
  next_stage text;
begin
  if public.compliance_admin_username(p_actor_id) is null
    or public.compliance_review_recipient(p_expected_stage) is distinct from p_actor_id
  then raise exception 'This invoice is awaiting its assigned reviewer'; end if;

  select review_stage into current_stage from public.unifi_invoices where id = p_invoice_id for update;
  if p_expected_stage = 'james' and current_stage = 'james' then
    next_stage := 'approved';
  elsif p_expected_stage in ('fikri', 'kevin') and current_stage in ('verification', 'fikri', 'kevin') then
    if current_stage not in ('verification', p_expected_stage) then return current_stage; end if;
    next_stage := case
      when current_stage <> 'verification' then 'james'
      when p_expected_stage = 'fikri' then 'kevin'
      else 'fikri'
    end;
  else
    raise exception 'The invoice review stage has changed';
  end if;

  update public.unifi_invoices set
    review_stage = next_stage,
    fikri_verified_at = case when p_expected_stage = 'fikri' then clock_timestamp() else fikri_verified_at end,
    fikri_verified_by = case when p_expected_stage = 'fikri' then p_actor_id else fikri_verified_by end,
    kevin_verified_at = case when p_expected_stage = 'kevin' then clock_timestamp() else kevin_verified_at end,
    kevin_verified_by = case when p_expected_stage = 'kevin' then p_actor_id else kevin_verified_by end,
    james_approved_at = case when p_expected_stage = 'james' then clock_timestamp() else james_approved_at end,
    james_approved_by = case when p_expected_stage = 'james' then p_actor_id else james_approved_by end
  where id = p_invoice_id;
  return next_stage;
end;
$$;

create function public.document_review_pending_recipients(p_stage text)
returns text[] language sql immutable set search_path = '' as $$
  select case
    when p_stage = 'verification' then array['fikri', 'kevin']
    when p_stage in ('fikri', 'kevin', 'james') then array[p_stage]
    else array[]::text[]
  end;
$$;

create function public.signed_document_review_stage(p_type text, p_id uuid)
returns text language sql stable set search_path = '' as $$
  select case
    when e @> jsonb_build_array(f) and e @> jsonb_build_array(k) then 'james'
    when e @> jsonb_build_array(f) then 'kevin'
    when e @> jsonb_build_array(k) then 'fikri'
    else 'verification'
  end
  from (
    select (select entries from public.document_verifications where document_type = p_type and document_id = p_id) e,
      jsonb_build_object('user_id', public.compliance_review_recipient('fikri')) f,
      jsonb_build_object('user_id', public.compliance_review_recipient('kevin')) k
  ) audit;
$$;

create function public.queue_pending_document_review(
  p_type text, p_id uuid, p_stage text, p_heading_prefix text, p_body text, p_href text
) returns void language sql set search_path = '' as $$
  with events as (
    insert into public.document_review_push_outbox(document_type, document_id, stage, recipient_id, title, body, href)
    select p_type, p_id, array_position(array['fikri', 'kevin', 'james'], reviewer) - 1, p.id,
      p_heading_prefix || case when reviewer = 'james' then 'approval' else 'verification' end, p_body, p_href
    from unnest(public.document_review_pending_recipients(p_stage)) reviewer
    join public.profiles p on p.id = public.compliance_review_recipient(reviewer)
    where p.role::text = 'admin' and p.is_active and p.deleted_at is null
    on conflict (document_type, document_id, stage) do nothing
    returning id, recipient_id, stage, title, body, href
  )
  insert into public.app_notifications(id, recipient_id, type, title, body, href, entity_id)
  select e.id, e.recipient_id,
    case when e.stage = 2 then 'document_approval_requested' else 'document_verification' end,
    e.title, e.body, e.href, p_id
  from events e
  where not exists (
    select 1 from public.app_notifications n where n.entity_id = p_id and n.recipient_id = e.recipient_id
      and n.href = e.href and n.type in ('document_verification', 'document_approval_requested') and n.read_at is null
  );
$$;

create or replace function public.queue_document_review_push(p_type text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  title text;
  period text;
  stage text;
begin
  if p_type = 'gym' then
    select case r.kind when 'committee' then 'Sports Committee Report' else 'Monthly Payment List' end, to_char(r.month, 'YYYY-MM')
    into title, period from public.gym_monthly_approvals r where r.id = p_id and r.approved_at is null;
  elsif p_type = 'billing' then
    select case r.kind when 'rental' then 'Rental invoice pack' else 'Utilities invoice pack' end, r.period
    into title, period from public.billing_preview_runs r
    where r.id = p_id and not exists (select 1 from public.billing_run_approvals a where a.run_id = r.id);
  end if;
  if title is null then return; end if;
  stage := public.signed_document_review_stage(p_type, p_id);
  perform public.queue_pending_document_review(p_type, p_id, stage, 'Requires your ',
    title || ' - ' || period || case when stage = 'james' then '. Please preview and approve.' else '. Please preview and verify.' end,
    '/admin/document-review/' || p_type || '/' || p_id::text);
end;
$$;

create or replace function public.queue_compliance_review_push()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare record_id uuid; record_title text;
begin
  if cardinality(public.document_review_pending_recipients(new.review_stage)) = 0 then return new; end if;
  select r.id, concat_ws(' · ', r.title, nullif(r.location, '')) into record_id, record_title
  from public.compliance_cycles c join public.compliance_records r on r.id = c.record_id
  where c.id = new.cycle_id;
  perform public.queue_pending_document_review('compliance', new.id, new.review_stage, 'Supplier document requires your ',
    record_title || ' · ' || new.file_name,
    '/admin/cert-servicing/records/' || record_id::text || '?focusCycle=' || new.cycle_id::text || '#document-' || new.id::text);
  return new;
end;
$$;

create or replace function public.queue_unifi_invoice_review_push()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform public.queue_pending_document_review('unifi_invoice', new.id, new.review_stage, 'TM Unifi invoice requires your ',
    'TM Unifi invoice · ' || new.period, '/admin/unifi-invoices/' || new.id::text);
  return new;
end;
$$;

create or replace function public.claim_document_review_push(event_id uuid, token uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare e public.document_review_push_outbox%rowtype; current_stage text; reviewer text;
begin
  select * into e from public.document_review_push_outbox where id = event_id for update;
  if not found or e.delivered_at is not null or e.locked_until > now() or token is null then return false; end if;

  case e.document_type
    when 'compliance' then
      select review_stage into current_stage from public.compliance_cycle_documents where id = e.document_id;
    when 'unifi_invoice' then
      select review_stage into current_stage from public.unifi_invoices where id = e.document_id;
    when 'gym' then
      select public.signed_document_review_stage('gym', id) into current_stage
      from public.gym_monthly_approvals where id = e.document_id and approved_at is null;
    when 'billing' then
      select public.signed_document_review_stage('billing', r.id) into current_stage from public.billing_preview_runs r
      where r.id = e.document_id and not exists (select 1 from public.billing_run_approvals a where a.run_id = r.id);
  end case;

  reviewer := (array['fikri', 'kevin', 'james'])[e.stage + 1];
  if not reviewer = any(public.document_review_pending_recipients(current_stage))
    or public.compliance_review_recipient(reviewer) is distinct from e.recipient_id
    or not exists (select 1 from public.profiles where id = e.recipient_id and role::text = 'admin' and is_active and deleted_at is null)
  then
    update public.document_review_push_outbox set delivered_at = now(), last_error = 'superseded', locked_until = null where id = event_id;
    return false;
  end if;
  update public.document_review_push_outbox set claim_token = token, locked_until = now() + interval '2 minutes' where id = event_id;
  return true;
end;
$$;

create or replace function public.claim_compliance_review_push(event_id uuid, token uuid) returns boolean
language sql security invoker set search_path = '' as $$
  select case when exists (
    select 1 from public.document_review_push_outbox where id = event_id and document_type = 'compliance'
  ) then public.claim_document_review_push(event_id, token) else false end;
$$;

create or replace function public.claim_unifi_invoice_review_push(event_id uuid, token uuid) returns boolean
language sql security invoker set search_path = '' as $$
  select case when exists (
    select 1 from public.document_review_push_outbox where id = event_id and document_type = 'unifi_invoice'
  ) then public.claim_document_review_push(event_id, token) else false end;
$$;

create function public.record_gym_report_reviewer_notice(p_id uuid, p_reviewer text, p_sent_at timestamptz)
returns void language sql security invoker set search_path = '' as $$
  update public.gym_monthly_approvals
  set notified_at = greatest(notified_at, p_sent_at),
    reviewer_notices = reviewer_notices || jsonb_build_object(p_reviewer, p_sent_at)
  where id = p_id and p_reviewer in ('fikri', 'kevinlee3335', 'james') and p_sent_at is not null;
$$;

revoke all on function public.document_review_pending_recipients(text),
  public.signed_document_review_stage(text, uuid), public.queue_pending_document_review(text, uuid, text, text, text, text),
  public.record_gym_report_reviewer_notice(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.document_review_pending_recipients(text),
  public.signed_document_review_stage(text, uuid), public.queue_pending_document_review(text, uuid, text, text, text, text),
  public.record_gym_report_reviewer_notice(uuid, text, timestamptz) to service_role;

-- Queue the newly eligible reviewer for pending documents without replaying existing events.
do $$
declare doc record;
begin
  for doc in
    select 'gym'::text as kind, id from public.gym_monthly_approvals where approved_at is null
    union all
    select 'billing', r.id from public.billing_preview_runs r
    where not exists (select 1 from public.billing_run_approvals a where a.run_id = r.id)
  loop
    perform public.queue_document_review_push(doc.kind, doc.id);
  end loop;
end;
$$;
update public.compliance_cycle_documents set review_stage = review_stage where review_stage = 'verification';
update public.unifi_invoices set review_stage = review_stage where review_stage = 'verification';

-- Existing undelivered notices should no longer describe an ordered hand-off.
with revised as (
  update public.document_review_push_outbox
  set body = regexp_replace(body, '[.] (Please preview and verify to forward to Kevin|Fikri has verified[.] Please preview and verify)[.]$', '. Please preview and verify.')
  where document_type in ('billing', 'gym') and stage in (0, 1)
    and body ~ '[.] (Please preview and verify to forward to Kevin|Fikri has verified[.] Please preview and verify)[.]$'
  returning id, body
)
update public.app_notifications n set body = revised.body from revised where n.id = revised.id and n.read_at is null;
