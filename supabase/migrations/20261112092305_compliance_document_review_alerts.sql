alter table public.document_review_push_outbox
  drop constraint document_review_push_outbox_document_type_check,
  add constraint document_review_push_outbox_document_type_check
    check (document_type in ('gym', 'billing', 'compliance'));

create function public.compliance_review_recipient(p_stage text)
returns uuid language sql immutable set search_path = '' as $$
  select case p_stage
    when 'fikri' then 'a21286a7-56fd-48e4-9571-ffeacf825692'::uuid
    when 'kevin' then '7a40e00f-2e95-4c27-83d9-0f7dba788b77'::uuid
    when 'james' then 'eeab5f04-30c3-42bd-a095-58e56c814358'::uuid
  end;
$$;
revoke all on function public.compliance_review_recipient(text) from public, anon, authenticated;
grant execute on function public.compliance_review_recipient(text) to service_role;

create function public.queue_compliance_review_push()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_recipient uuid := public.compliance_review_recipient(new.review_stage);
  v_stage integer := array_position(array['fikri', 'kevin', 'james'], new.review_stage) - 1;
  v_record_id uuid;
  v_record_title text;
  v_heading text;
  v_body text;
  v_href text;
  v_event uuid;
begin
  if v_recipient is null or not exists (
    select 1 from public.profiles where id = v_recipient and role = 'admin' and is_active and deleted_at is null
  ) then return new; end if;

  select r.id, concat_ws(' · ', r.title, nullif(r.location, '')) into v_record_id, v_record_title
  from public.compliance_cycles c join public.compliance_records r on r.id = c.record_id
  where c.id = new.cycle_id;
  v_heading := case when v_stage = 2 then 'Supplier document requires your approval' else 'Supplier document requires your verification' end;
  v_body := v_record_title || ' · ' || new.file_name;
  v_href := '/admin/cert-servicing/records/' || v_record_id::text || '?focusCycle=' || new.cycle_id::text || '#document-' || new.id::text;

  insert into public.document_review_push_outbox(document_type, document_id, stage, recipient_id, title, body, href)
  values ('compliance', new.id, v_stage, v_recipient, v_heading, v_body, v_href)
  on conflict (document_type, document_id, stage) do nothing returning id into v_event;
  if v_event is not null then
    insert into public.app_notifications(id, recipient_id, type, title, body, href, entity_id)
    values (v_event, v_recipient, case when v_stage = 2 then 'document_approval_requested' else 'document_verification' end,
      v_heading, v_body, v_href, new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.queue_compliance_review_push() from public, anon, authenticated;
grant execute on function public.queue_compliance_review_push() to service_role;
create trigger compliance_document_review_push
after insert or update of review_stage on public.compliance_cycle_documents
for each row execute function public.queue_compliance_review_push();

create function public.claim_compliance_review_push(event_id uuid, token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  e public.document_review_push_outbox%rowtype;
  v_stage text;
begin
  select * into e from public.document_review_push_outbox where id = event_id and document_type = 'compliance' for update;
  if not found or e.delivered_at is not null or e.locked_until > now() or token is null then return false; end if;
  select review_stage into v_stage from public.compliance_cycle_documents where id = e.document_id;
  if public.compliance_review_recipient(v_stage) is distinct from e.recipient_id
    or (array_position(array['fikri', 'kevin', 'james'], v_stage) - 1) is distinct from e.stage
    or not exists (select 1 from public.profiles where id = e.recipient_id and role = 'admin' and is_active and deleted_at is null)
  then
    update public.document_review_push_outbox set delivered_at = now(), last_error = 'superseded', locked_until = null where id = event_id;
    return false;
  end if;
  update public.document_review_push_outbox set claim_token = token, locked_until = now() + interval '2 minutes' where id = event_id;
  return true;
end;
$$;
revoke all on function public.claim_compliance_review_push(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_compliance_review_push(uuid, uuid) to service_role;
