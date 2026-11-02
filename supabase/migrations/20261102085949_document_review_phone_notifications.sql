create table public.document_review_push_outbox (
 id uuid primary key default gen_random_uuid(),
 document_type text not null check(document_type in ('gym','billing')),
 document_id uuid not null,
 stage integer not null check(stage between 0 and 2),
 recipient_id uuid not null references public.profiles(id),
 title text not null,body text not null,href text not null,
 created_at timestamptz not null default now(),
 delivered_at timestamptz,locked_until timestamptz,claim_token uuid,last_error text,
 unique(document_type,document_id,stage)
);
alter table public.document_review_push_outbox enable row level security;
revoke all on public.document_review_push_outbox from anon,authenticated;
grant all on public.document_review_push_outbox to service_role;
create policy service_only on public.document_review_push_outbox to service_role using(true) with check(true);
create index document_review_push_pending on public.document_review_push_outbox(created_at) where delivered_at is null;

create function public.queue_document_review_push(p_type text,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_stage integer;v_recipient uuid;v_title text;v_period text;v_event uuid;v_heading text;v_body text;v_href text;
begin
 if p_type='gym' then
  select case kind when 'committee' then 'Sports Committee Report' else 'Monthly Payment List' end,to_char(month,'YYYY-MM') into v_title,v_period
  from public.gym_monthly_approvals where id=p_id and approved_at is null;
 elsif p_type='billing' then
  select case kind when 'rental' then 'Rental invoice pack' else 'Utilities invoice pack' end,period into v_title,v_period
  from public.billing_preview_runs r where id=p_id and not exists(select 1 from public.billing_run_approvals a where a.run_id=r.id);
 else return;
 end if;
 if v_title is null then return;end if;
 select coalesce((select jsonb_array_length(entries) from public.document_verifications where document_type=p_type and document_id=p_id),0) into v_stage;
 if v_stage>2 then return;end if;
 select id into v_recipient from public.profiles where username=case v_stage when 0 then 'fikri' when 1 then 'kevinlee3335' else 'james' end and role='admin' and is_active and deleted_at is null;
 if v_recipient is null then return;end if;
 v_heading=case when v_stage=2 then 'Requires your approval' else 'Requires your verification' end;
 v_body=v_title||' - '||v_period||case when v_stage=2 then '. Fikri and Kevin have verified. Please preview and approve.' when v_stage=1 then '. Fikri has verified. Please preview and verify.' else '. Please preview and verify to forward to Kevin.' end;
 v_href='/admin/document-review/'||p_type||'/'||p_id::text;
 insert into public.document_review_push_outbox(document_type,document_id,stage,recipient_id,title,body,href)
 values(p_type,p_id,v_stage,v_recipient,v_heading,v_body,v_href)
 on conflict(document_type,document_id,stage) do nothing returning id into v_event;
 if v_event is not null and not exists(select 1 from public.app_notifications where entity_id=p_id and recipient_id=v_recipient and type in ('document_verification','document_approval_requested') and read_at is null) then
  insert into public.app_notifications(id,recipient_id,type,title,body,href,entity_id)
  values(v_event,v_recipient,case when v_stage=2 then 'document_approval_requested' else 'document_verification' end,v_heading,v_body,v_href,p_id);
 end if;
end $$;
revoke all on function public.queue_document_review_push(text,uuid) from public,anon,authenticated;
grant execute on function public.queue_document_review_push(text,uuid) to service_role;

create function public.trigger_document_review_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='document_verifications' then
  perform public.queue_document_review_push(new.document_type,new.document_id);
 elsif tg_table_name='billing_preview_runs' then
  perform public.queue_document_review_push('billing',new.id);
 else
  perform public.queue_document_review_push('gym',new.id);
 end if;
 return new;
end $$;
revoke all on function public.trigger_document_review_push() from public,anon,authenticated;
create trigger rental_utility_review_push after insert on public.billing_preview_runs for each row execute function public.trigger_document_review_push();
create trigger gym_report_review_push after insert on public.gym_monthly_approvals for each row execute function public.trigger_document_review_push();
create trigger verified_document_review_push after insert or update of entries on public.document_verifications for each row execute function public.trigger_document_review_push();

create function public.claim_document_review_push(event_id uuid,token uuid) returns boolean
language plpgsql set search_path='' as $$
declare e public.document_review_push_outbox%rowtype;v_stage integer;v_pending boolean;
begin
 select * into e from public.document_review_push_outbox where id=event_id for update;
 if not found or e.delivered_at is not null or e.locked_until>now() then return false;end if;
 select coalesce((select jsonb_array_length(entries) from public.document_verifications where document_type=e.document_type and document_id=e.document_id),0) into v_stage;
 if e.document_type='gym' then
  select exists(select 1 from public.gym_monthly_approvals where id=e.document_id and approved_at is null) into v_pending;
 else
  select exists(select 1 from public.billing_preview_runs r where id=e.document_id and not exists(select 1 from public.billing_run_approvals a where a.run_id=r.id)) into v_pending;
 end if;
 if not v_pending or v_stage<>e.stage or not exists(select 1 from public.profiles where id=e.recipient_id and is_active and deleted_at is null) then
  update public.document_review_push_outbox set delivered_at=now(),last_error='superseded',locked_until=null where id=event_id;
  return false;
 end if;
 update public.document_review_push_outbox set claim_token=token,locked_until=now()+interval '2 minutes' where id=event_id;
 return true;
end $$;
revoke all on function public.claim_document_review_push(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_document_review_push(uuid,uuid) to service_role;

do $$ declare r record;begin
 for r in select 'gym'::text t,id from public.gym_monthly_approvals where approved_at is null
 union all select 'billing',b.id from public.billing_preview_runs b where not exists(select 1 from public.billing_run_approvals a where a.run_id=b.id)
 loop perform public.queue_document_review_push(r.t,r.id);end loop;
end $$;
