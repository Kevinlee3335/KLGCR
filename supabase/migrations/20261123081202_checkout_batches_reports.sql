-- Persistent batches; completed batches retain immutable snapshots and original evidence.
create table public.checkout_batches (
 id uuid primary key default gen_random_uuid(),
 sequence_no bigint generated always as identity unique,
 batch_no text not null unique default '',
 name text not null default 'Check-out batch',
 state text not null default 'active' check(state in ('active','closing','closed')),
 started_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 closed_at timestamptz, closed_by uuid references public.profiles(id),
 closing_note text, snapshot jsonb,
 summary_document_id uuid not null default gen_random_uuid(),
 details_document_id uuid not null default gen_random_uuid()
);
create unique index checkout_one_open_batch on public.checkout_batches((true)) where state in ('active','closing');
alter table public.checkout_batches enable row level security;
revoke all on public.checkout_batches from public,anon,authenticated;
grant select on public.checkout_batches to authenticated;
create policy "management reads checkout batches" on public.checkout_batches for select to authenticated using(public.is_management());

create function public.number_checkout_batch() returns trigger language plpgsql set search_path='' as $$
begin
 new.batch_no:='COB-'||to_char(new.started_at at time zone 'Asia/Kuala_Lumpur','YYYY')||'-'||lpad(new.sequence_no::text,4,'0');
 return new;
end $$;
create trigger number_checkout_batch before insert on public.checkout_batches for each row execute function public.number_checkout_batch();
revoke all on function public.number_checkout_batch() from public,anon,authenticated;

alter table public.checkout_rooms add column batch_id uuid references public.checkout_batches(id), add column batch_archived_at timestamptz;
alter table public.inventory_adjustment_history add column checkout_batch_id uuid references public.checkout_batches(id);
-- Existing explicit check-out stock-outs are attributable; other-purpose stock is never inferred.
insert into public.checkout_batches(name,started_at)
 select 'Current check-out batch',coalesce(min(created_at),now()) from public.checkout_rooms;
do $$begin if exists(select 1 from pg_trigger where tgrelid='public.checkout_rooms'::regclass and tgname='checkout_rooms_updated_at') then alter table public.checkout_rooms disable trigger checkout_rooms_updated_at;end if;end$$;
update public.checkout_rooms set batch_id=(select id from public.checkout_batches where state='active');
do $$begin if exists(select 1 from pg_trigger where tgrelid='public.checkout_rooms'::regclass and tgname='checkout_rooms_updated_at') then alter table public.checkout_rooms enable trigger checkout_rooms_updated_at;end if;end$$;
update public.inventory_adjustment_history a set checkout_batch_id=b.id from public.checkout_batches b
 where b.state='active' and a.adjustment_type='correction_remove' and a.adjusted_at>=b.started_at
 and a.note ~* '(check[[:space:]/-]*out|chcek[[:space:]/-]*out)';
alter table public.checkout_rooms alter column batch_id set not null;
create index checkout_rooms_batch_idx on public.checkout_rooms(batch_id,created_at);
create index checkout_adjustment_batch_idx on public.inventory_adjustment_history(checkout_batch_id) where checkout_batch_id is not null;

-- Serialize batch membership, mutations and close under one transaction lock.
create function public.guard_checkout_batch() returns trigger language plpgsql security definer set search_path='' as $$
declare bid uuid; bs text; closed_time timestamptz; rid uuid; req uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('checkout-batch-lifecycle',0));
 if tg_table_name='checkout_rooms' then
  if tg_op='INSERT' then
   select id,state into bid,bs from public.checkout_batches where state in ('active','closing');
   if bs='closing' then raise exception 'Batch reports are being generated. Finish or retry End Batch before adding rooms.';end if;
   if bid is null then insert into public.checkout_batches default values returning id,state into bid,bs;end if;
   if new.batch_id is not null and new.batch_id<>bid then raise exception 'New rooms must belong to the current batch';end if;
   new.batch_id:=bid;
   if new.batch_archived_at is not null then raise exception 'New rooms cannot be archived';end if;
   return new;
  end if;
  bid:=old.batch_id;
  if tg_op='UPDATE' and new.batch_id<>old.batch_id then raise exception 'Room batch cannot be changed';end if;
 elsif tg_table_name='inventory_adjustment_history' then
  bid:=case when tg_op='DELETE' then old.checkout_batch_id else new.checkout_batch_id end;
  if tg_op='UPDATE' and old.checkout_batch_id is not null and new.checkout_batch_id is distinct from old.checkout_batch_id then raise exception 'Stock-out batch cannot be changed';end if;
 elsif tg_table_name='material_request_items' then
  if tg_op='UPDATE' and new.request_id<>old.request_id then raise exception 'Material request source cannot be changed';end if;
  req:=case when tg_op='DELETE' then old.request_id else new.request_id end;
  select checkout_room_id into rid from public.material_requests where id=req;
 elsif tg_table_name='material_request_item_history' then
  if tg_op='UPDATE' and new.request_id<>old.request_id then raise exception 'Material request source cannot be changed';end if;
  req:=case when tg_op='DELETE' then old.request_id else new.request_id end;
  select checkout_room_id into rid from public.material_requests where id=req;
 else
  rid:=case when tg_op='DELETE' then old.checkout_room_id else new.checkout_room_id end;
  if tg_op='UPDATE' and old.checkout_room_id is not null and new.checkout_room_id is distinct from old.checkout_room_id then raise exception 'Check-out source cannot be changed';end if;
 end if;
 if rid is not null then select batch_id into bid from public.checkout_rooms where id=rid;end if;
 if bid is not null then
  select state,closed_at into bs,closed_time from public.checkout_batches where id=bid;
  if tg_table_name='checkout_rooms' and tg_op='UPDATE' then
   if bs='closed' and new.batch_archived_at=closed_time and (to_jsonb(new)-'batch_archived_at'-'updated_at')=(to_jsonb(old)-'batch_archived_at'-'updated_at') then return new;end if;
   if new.batch_archived_at is distinct from old.batch_archived_at then raise exception 'Use End Batch to archive rooms';end if;
  end if;
  if bs<>'active' then raise exception 'This batch is archived or generating reports. Start a new inspection in the current batch.';end if;
 end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end $$;
revoke all on function public.guard_checkout_batch() from public,anon,authenticated;
create trigger guard_checkout_batch before insert or update or delete on public.checkout_rooms for each row execute function public.guard_checkout_batch();
create trigger guard_checkout_batch before insert or update or delete on public.inventory_adjustment_history for each row execute function public.guard_checkout_batch();
create trigger guard_checkout_batch before insert or update or delete on public.material_requests for each row execute function public.guard_checkout_batch();
create trigger guard_checkout_batch before insert or update or delete on public.material_request_items for each row execute function public.guard_checkout_batch();
create trigger guard_checkout_batch before insert or update or delete on public.material_request_item_history for each row execute function public.guard_checkout_batch();
create trigger guard_checkout_batch before insert or update or delete on public.inventory_issue_history for each row execute function public.guard_checkout_batch();
create trigger guard_checkout_batch before insert or update or delete on public.checkout_defects for each row execute function public.guard_checkout_batch();
create trigger guard_checkout_batch before insert or update or delete on public.checkout_history for each row execute function public.guard_checkout_batch();
create trigger guard_checkout_batch before insert or update or delete on public.checkout_photos for each row execute function public.guard_checkout_batch();
create trigger guard_checkout_batch before insert or update or delete on public.checkout_paint_tasks for each row execute function public.guard_checkout_batch();

create table public.checkout_material_returns (
 id uuid primary key, batch_id uuid not null references public.checkout_batches(id),
 issue_id bigint references public.inventory_issue_history(id), adjustment_id bigint references public.inventory_adjustment_history(id),
 inventory_item_id uuid not null references public.inventory_items(id),
 qty numeric not null check(qty>0 and qty=round(qty,2)), returned_by text not null,
 received_by uuid not null references public.profiles(id), note text not null, created_at timestamptz not null default now(),
 check(num_nonnulls(issue_id,adjustment_id)=1)
);
create index checkout_return_batch_idx on public.checkout_material_returns(batch_id);
alter table public.checkout_material_returns enable row level security;
revoke all on public.checkout_material_returns from public,anon,authenticated;
grant select on public.checkout_material_returns to authenticated;
create policy "management reads checkout returns" on public.checkout_material_returns for select to authenticated using(public.is_management());

create function public.record_checkout_stockout(p_batch_id uuid,p_item_id uuid,p_qty numeric,p_taken_by text,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare before_qty numeric;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required';end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout-batch-lifecycle',0));
 if not exists(select 1 from public.checkout_batches where id=p_batch_id and state='active') then raise exception 'Select the current active batch';end if;
 if p_qty is null or p_qty<=0 or p_qty<>round(p_qty,2) or p_qty>9999999999.99 or length(trim(p_taken_by)) not between 1 and 100 or length(trim(p_note)) not between 1 and 500 then raise exception 'Enter quantity, recipient and purpose';end if;
 select balance_qty into before_qty from public.inventory_items where id=p_item_id and is_active and not quantity_unverified for update;
 if not found or before_qty<p_qty then raise exception 'Insufficient or unconfirmed stock';end if;
 update public.inventory_items set balance_qty=balance_qty-p_qty where id=p_item_id;
 insert into public.inventory_adjustment_history(inventory_item_id,adjustment_type,qty,balance_before,balance_after,note,adjusted_by,checkout_batch_id)
 values(p_item_id,'correction_remove',p_qty,before_qty,before_qty-p_qty,'Stock Out | Taken by: '||trim(p_taken_by)||' | Purpose: '||trim(p_note),auth.uid(),p_batch_id);
end $$;
revoke all on function public.record_checkout_stockout(uuid,uuid,numeric,text,text) from public,anon;
grant execute on function public.record_checkout_stockout(uuid,uuid,numeric,text,text) to authenticated;

create function public.return_checkout_material(p_id uuid,p_batch_id uuid,p_source text,p_source_id bigint,p_qty numeric,p_returned_by text,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare item uuid; issued numeric; returned numeric; before_qty numeric; existing public.checkout_material_returns;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required';end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout-batch-lifecycle',0));
 select * into existing from public.checkout_material_returns where id=p_id;
 if found then
  if existing.batch_id=p_batch_id and existing.qty=p_qty and existing.returned_by=trim(p_returned_by) and existing.note=trim(p_note)
    and ((p_source='issue' and existing.issue_id=p_source_id) or (p_source='stockout' and existing.adjustment_id=p_source_id)) then return;end if;
  raise exception 'Return reference already used';
 end if;
 if p_id is null or p_qty is null or p_qty<=0 or p_qty<>round(p_qty,2) or p_qty>9999999999.99 or length(trim(p_returned_by)) not between 1 and 100 or length(trim(p_note)) not between 1 and 500 then raise exception 'Enter a valid return quantity, name and reason';end if;
 if not exists(select 1 from public.checkout_batches where id=p_batch_id and state='active') then raise exception 'Returns can only be recorded before End Batch';end if;
 if p_source='issue' then
  select h.inventory_item_id,h.qty into item,issued from public.inventory_issue_history h join public.checkout_rooms r on r.id=h.checkout_room_id where h.id=p_source_id and r.batch_id=p_batch_id;
  select coalesce(sum(qty),0) into returned from public.checkout_material_returns where issue_id=p_source_id;
 elsif p_source='stockout' then
  select inventory_item_id,qty into item,issued from public.inventory_adjustment_history where id=p_source_id and checkout_batch_id=p_batch_id and adjustment_type='correction_remove';
  select coalesce(sum(qty),0) into returned from public.checkout_material_returns where adjustment_id=p_source_id;
 else raise exception 'Invalid material source';end if;
 if item is null or p_qty>issued-returned then raise exception 'Return exceeds the remaining issued quantity';end if;
 select balance_qty into before_qty from public.inventory_items where id=item for update;
 update public.inventory_items set balance_qty=balance_qty+p_qty where id=item;
 insert into public.inventory_adjustment_history(inventory_item_id,adjustment_type,qty,balance_before,balance_after,note,adjusted_by)
 values(item,'correction_add',p_qty,before_qty,before_qty+p_qty,'Check-out batch return | '||trim(p_returned_by)||' | '||trim(p_note),auth.uid());
 insert into public.checkout_material_returns(id,batch_id,issue_id,adjustment_id,inventory_item_id,qty,returned_by,received_by,note)
 values(p_id,p_batch_id,case when p_source='issue' then p_source_id end,case when p_source='stockout' then p_source_id end,item,p_qty,trim(p_returned_by),auth.uid(),trim(p_note));
end $$;
revoke all on function public.return_checkout_material(uuid,uuid,text,bigint,numeric,text,text) from public,anon;
grant execute on function public.return_checkout_material(uuid,uuid,text,bigint,numeric,text,text) to authenticated;

-- Single snapshot includes every original room (including removed records), checklist,
-- defect, history event, photo, painting task, request decision, issue and return.
create function public.checkout_batch_snapshot(p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_management() then raise exception 'Management access required';end if;
 select snapshot into result from public.checkout_batches where id=p_batch_id and state in ('closing','closed') and snapshot is not null;
 if result is not null then return result;end if;
 select jsonb_build_object(
 'version',1,'batch',to_jsonb(b)||jsonb_build_object('snapshot',null,'closed_by_name',(select full_name from public.profiles where id=b.closed_by)),
 'rooms',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('block',bl.code,'maintenance_name',m.full_name,'cleaner_name',c.full_name,'created_by_name',p.full_name) order by bl.code,r.room_no,r.created_at)
  from public.checkout_rooms r join public.blocks bl on bl.id=r.block_id left join public.profiles m on m.id=r.assigned_to left join public.profiles c on c.id=r.cleaner_id left join public.profiles p on p.id=r.created_by where r.batch_id=b.id),'[]'::jsonb),
 'defects',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('created_by_name',p.full_name,'rectified_by_name',v.full_name) order by d.created_at,d.id) from public.checkout_defects d join public.checkout_rooms r on r.id=d.checkout_room_id left join public.profiles p on p.id=d.created_by left join public.profiles v on v.id=d.rectified_by where r.batch_id=b.id),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('actor_name',p.full_name) order by h.created_at,h.id) from public.checkout_history h join public.checkout_rooms r on r.id=h.checkout_room_id left join public.profiles p on p.id=h.actor_id where r.batch_id=b.id),'[]'::jsonb),
 'photos',coalesce((select jsonb_agg(to_jsonb(ph)||jsonb_build_object('uploaded_by_name',p.full_name) order by ph.created_at,ph.id) from public.checkout_photos ph join public.checkout_rooms r on r.id=ph.checkout_room_id left join public.profiles p on p.id=ph.uploaded_by where r.batch_id=b.id),'[]'::jsonb),
 'painting',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('created_by_name',p.full_name) order by t.created_at,t.id) from public.checkout_paint_tasks t join public.checkout_rooms r on r.id=t.checkout_room_id left join public.profiles p on p.id=t.created_by where r.batch_id=b.id),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('requested_by_name',p.full_name,'reviewed_by_name',v.full_name,'issued_by_name',i.full_name) order by q.created_at,q.id) from public.material_requests q join public.checkout_rooms r on r.id=q.checkout_room_id left join public.profiles p on p.id=q.requested_by left join public.profiles v on v.id=q.reviewed_by left join public.profiles i on i.id=q.issued_by where r.batch_id=b.id),'[]'::jsonb),
 'request_items',coalesce((select jsonb_agg(to_jsonb(li)||jsonb_build_object('item_code',i.item_code,'description',coalesce(i.description,li.other_item_name),'unit',i.unit,'inventory_group',i.inventory_group,'approved_by_name',p.full_name,'decided_by_name',v.full_name) order by li.request_id,li.id) from public.material_request_items li join public.material_requests q on q.id=li.request_id join public.checkout_rooms r on r.id=q.checkout_room_id left join public.inventory_items i on i.id=li.inventory_item_id left join public.profiles p on p.id=li.approved_by left join public.profiles v on v.id=li.decided_by where r.batch_id=b.id),'[]'::jsonb),
 'decisions',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('actor_name',p.full_name) order by h.created_at,h.id) from public.material_request_item_history h join public.material_requests q on q.id=h.request_id join public.checkout_rooms r on r.id=q.checkout_room_id left join public.profiles p on p.id=h.actor_id where r.batch_id=b.id),'[]'::jsonb),
 'issues',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('item_code',i.item_code,'description',i.description,'unit',i.unit,'inventory_group',i.inventory_group,'staff_name',p.full_name,'issued_by_name',v.full_name) order by h.issued_at,h.id) from public.inventory_issue_history h join public.checkout_rooms r on r.id=h.checkout_room_id join public.inventory_items i on i.id=h.inventory_item_id left join public.profiles p on p.id=h.staff_id left join public.profiles v on v.id=h.issued_by where r.batch_id=b.id),'[]'::jsonb),
 'stockouts',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('item_code',i.item_code,'description',i.description,'unit',i.unit,'inventory_group',i.inventory_group,'issued_by_name',p.full_name) order by h.adjusted_at,h.id) from public.inventory_adjustment_history h join public.inventory_items i on i.id=h.inventory_item_id left join public.profiles p on p.id=h.adjusted_by where h.checkout_batch_id=b.id and h.adjustment_type='correction_remove'),'[]'::jsonb),
 'returns',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('received_by_name',p.full_name) order by h.created_at,h.id) from public.checkout_material_returns h left join public.profiles p on p.id=h.received_by where h.batch_id=b.id),'[]'::jsonb)
 ) into result from public.checkout_batches b where b.id=p_batch_id;
 if result is null then raise exception 'Batch not found';end if;
 return result;
end $$;
revoke all on function public.checkout_batch_snapshot(uuid) from public,anon;
grant execute on function public.checkout_batch_snapshot(uuid) to authenticated;

create function public.prepare_checkout_batch_close(p_batch_id uuid,p_close_unissued boolean default false,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.checkout_batches; li record; snap jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_note is null or length(p_note)>2000 then raise exception 'Closing note is too long';end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout-batch-lifecycle',0));
 select * into b from public.checkout_batches where id=p_batch_id for update;
 if not found then raise exception 'Batch not found';end if;
 if b.state in ('closing','closed') then return b.snapshot;end if;
 if not exists(select 1 from public.checkout_rooms where batch_id=b.id and deleted_at is null) then raise exception 'There are no rooms in this batch';end if;
 if exists(select 1 from public.checkout_rooms where batch_id=b.id and deleted_at is null and status<>'ready_for_occupancy') then raise exception 'Complete all rooms before ending this batch';end if;
 if exists(select 1 from public.checkout_defects d join public.checkout_rooms r on r.id=d.checkout_room_id where r.batch_id=b.id and r.deleted_at is null and d.status='open' and d.description !~* '^\s*no defects?[.!]?\s*$') then raise exception 'Complete all repair defects before ending this batch';end if;
 if exists(select 1 from public.checkout_paint_tasks t join public.checkout_rooms r on r.id=t.checkout_room_id where r.batch_id=b.id and r.deleted_at is null and t.status in ('assigned','in_progress')) then raise exception 'Complete all painting work before ending this batch';end if;
 if exists(select 1 from public.material_requests q join public.checkout_rooms r on r.id=q.checkout_room_id where r.batch_id=b.id and q.status in ('pending','approved')) then
  if not p_close_unissued then raise exception 'Review and confirm closure of unissued material requests first';end if;
  for li in select i.*,q.status request_status from public.material_request_items i join public.material_requests q on q.id=i.request_id join public.checkout_rooms r on r.id=q.checkout_room_id where r.batch_id=b.id and q.status in ('pending','approved') and i.line_status='active' and coalesce(i.issued_qty,0)=0 loop
   perform public.amend_material_request_item(li.request_id,li.id,case when coalesce(li.approved_qty,0)>0 then 'cancel' else 'reject' end,'Unissued balance closed with batch '||b.batch_no,li.inventory_item_id,li.requested_qty,li.approved_qty);
  end loop;
  if exists(select 1 from public.material_requests q join public.checkout_rooms r on r.id=q.checkout_room_id where r.batch_id=b.id and q.status in ('pending','approved')) then raise exception 'A partially issued request needs review before closing';end if;
 end if;
 update public.checkout_batches set state='closing',closed_at=now(),closed_by=auth.uid(),closing_note=nullif(trim(p_note),'') where id=b.id;
 snap:=public.checkout_batch_snapshot(b.id);
 update public.checkout_batches set snapshot=snap where id=b.id;
 return snap;
end $$;
revoke all on function public.prepare_checkout_batch_close(uuid,boolean,text) from public,anon;
grant execute on function public.prepare_checkout_batch_close(uuid,boolean,text) to authenticated;

create function public.finish_checkout_batch_close(p_batch_id uuid,p_summary_path text,p_details_path text) returns void
language plpgsql security definer set search_path='' as $$
declare b public.checkout_batches; ss bigint; ds bigint;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required';end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout-batch-lifecycle',0));
 select * into b from public.checkout_batches where id=p_batch_id for update;
 if b.state='closed' then return;end if;
 if b.id is null or b.state<>'closing' or b.snapshot is null then raise exception 'Prepare this batch before finalizing';end if;
 if p_summary_path not like auth.uid()::text||'/'||b.summary_document_id::text||'/%' or p_details_path not like auth.uid()::text||'/'||b.details_document_id::text||'/%' then raise exception 'Invalid report paths';end if;
 select (metadata->>'size')::bigint into ss from storage.objects where bucket_id='system-documents' and name=p_summary_path;
 select (metadata->>'size')::bigint into ds from storage.objects where bucket_id='system-documents' and name=p_details_path;
 if ss is null or ss<=0 or ds is null or ds<=0 then raise exception 'Both PDF uploads must finish before closing';end if;
 insert into public.system_documents(id,file_name,storage_path,size_bytes,uploaded_by,category) values
 (b.summary_document_id,b.batch_no||'_Summary.pdf',p_summary_path,ss,auth.uid(),'Check-out Batch Reports'),
 (b.details_document_id,b.batch_no||'_Full_Details.pdf',p_details_path,ds,auth.uid(),'Check-out Batch Reports');
 update public.checkout_batches set state='closed',snapshot=jsonb_set(snapshot,'{batch,state}','"closed"'::jsonb) where id=b.id;
 update public.checkout_rooms set batch_archived_at=b.closed_at where batch_id=b.id and deleted_at is null;
 insert into public.checkout_batches(name) values('Next check-out batch');
end $$;
revoke all on function public.finish_checkout_batch_close(uuid,text,text) from public,anon;
grant execute on function public.finish_checkout_batch_close(uuid,text,text) to authenticated;

-- Keep the 30-day inspection lookup untouched: it intentionally reads archived rooms.
-- Active progress, totals and daily reports exclude archived batches.

create or replace view public.checkout_room_progress with (security_invoker = true) as
with rooms as (
  select r.id, r.reference_no, r.room_no, r.status, r.assigned_to, r.cleaner_id, r.created_at,
    b.code as block_code, m.full_name as maintenance_name, c.full_name as cleaner_name,
    upper(regexp_replace(r.room_no, '[[:space:]-]+', '', 'g')) as room_number,
    r.utmspace_defects ~* '^\s*no defects?[.!]?\s*$' as no_defect,
    d.defect_count, d.remaining_count, d.painting_only,
    case
      when p.in_progress then 'in_progress'
      when p.assigned then 'assigned'
      when p.completed then 'completed'
    end as painting_status
  from public.checkout_rooms r
  join public.blocks b on b.id = r.block_id
  left join public.profiles m on m.id = r.assigned_to
  left join public.profiles c on c.id = r.cleaner_id
  cross join lateral (
    select count(*) as defect_count, count(*) filter (where status = 'open') as remaining_count,
      coalesce(bool_and(description ~* '\mpaint(ing)?\M|\mmou?ld(y)?\M|\m(wall|ceiling)\M.*(stain|dirty|peel|damp|water[[:space:]]*mark|seepage)|(stain|dirty|peel|damp|water[[:space:]]*mark|seepage).*\m(wall|ceiling)\M') filter (where status = 'open'), false) as painting_only
    from public.checkout_defects
    where checkout_room_id = r.id and description !~* '^\s*no defects?[.!]?\s*$'
  ) d
  cross join lateral (
    select bool_or(status = 'in_progress') as in_progress,
      bool_or(status = 'assigned') as assigned,
      bool_or(status = 'completed') as completed
    from public.checkout_paint_tasks
    where checkout_room_id = r.id
  ) p
  where r.deleted_at is null and r.batch_archived_at is null and (select public.is_management())
), eligible as (
  select rooms.*,
    case when starts_with(room_number, block_code) then room_number else block_code || room_number end as full_room,
    cleaner_id is null and (
      (status = 'verification' and remaining_count = 0) or
      (status = 'second_inspection' and defect_count = 0 and no_defect)
    ) as can_assign_cleaner,
    status = 'second_inspection' and assigned_to is null and defect_count > 0 as can_assign_maintenance
  from rooms
), classified as (
  select eligible.*,
    case
      when status = 'ready_for_occupancy' then 'ready_for_occupancy'
      when status = 'cleaning' then 'cleaning'
      when can_assign_cleaner and defect_count = 0 then 'no_defect_cleaner'
      when can_assign_cleaner then 'repair_complete_cleaner'
      when status = 'rectification' then 'rectification'
      when can_assign_maintenance and painting_only then 'painting_only'
      when status = 'second_inspection' and defect_count > 0 then 'awaiting_maintenance'
      else status::text
    end as progress_status
  from eligible
)
select id, reference_no, room_no, status, assigned_to, cleaner_id, created_at,
  block_code, maintenance_name, cleaner_name, defect_count, remaining_count, painting_status,
  progress_status, can_assign_cleaner, can_assign_maintenance,
  can_assign_maintenance and painting_only and coalesce(painting_status not in ('assigned', 'in_progress'), true) as can_assign_painting,
  regexp_replace(full_room, '[^A-Z0-9]', '', 'g') as search_room,
  regexp_replace(room_number, '[^A-Z0-9]', '', 'g') as search_room_number,
  regexp_replace(room_number, '[0-9]+$', '') as sort_room_prefix,
  substring(room_number from '[0-9]+$')::numeric as sort_room_number,
  array_position(array['painting_only', 'awaiting_maintenance', 'rectification', 'no_defect_cleaner',
    'repair_complete_cleaner', 'cleaning', 'verification', 'second_inspection', 'ready_for_occupancy'], progress_status) as status_rank
from classified;

revoke all on public.checkout_room_progress from public, anon, authenticated;
grant select on public.checkout_room_progress to authenticated;

-- Current cleaning assignments take precedence over completion history from a previous round.
-- Retain original history while clearing completion dates for active rework in reports.
CREATE OR REPLACE FUNCTION public.checkout_status_report(p_date date, p_group text DEFAULT 'ALL'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with defect_counts as (
 select checkout_room_id,count(*) filter(where description !~* '^\s*no defects?[.!]?\s*$') total,
 count(*) filter(where description !~* '^\s*no defects?[.!]?\s*$' and status='open') remaining,
 max(rectified_at) filter(where status='rectified') repaired_at from public.checkout_defects group by checkout_room_id
), history as (
 select checkout_room_id,max(created_at) filter(where action='rectification_completed') repaired_at,
 max(created_at) filter(where action='cleaning_completed') cleaned_at from public.checkout_history group by checkout_room_id
), rows as (
 select r.id,r.reference_no,r.room_no,b.code block,r.status,r.assigned_to,r.cleaner_id,
 coalesce(m.full_name,'Unassigned') maintenance,coalesce(c.full_name,'Unassigned') cleaner,
 case when r.status='second_inspection' then 'Awaiting inspection' when coalesce(d.remaining,0)=0 then 'Completed'
 when exists(select 1 from public.material_requests mr where mr.checkout_room_id=r.id and mr.status in ('pending','approved')) then 'Pending Material' else 'In Progress' end maintenance_status,
 case when r.status in ('second_inspection','rectification') or (r.status='verification' and r.cleaner_id is null) then 'Not handed to cleaning' when r.status='cleaning' then 'In Progress' when h.cleaned_at is not null or r.status='ready_for_occupancy' then 'Completed' else 'Awaiting assignment' end cleaner_status,
 coalesce(h.repaired_at,d.repaired_at) repaired_at,case when r.status in ('second_inspection','rectification','cleaning') or (r.status='verification' and r.cleaner_id is null) then null when r.status='ready_for_occupancy' then coalesce(r.ready_at,h.cleaned_at) else h.cleaned_at end cleaned_at,
 case when coalesce(d.total,0)=0 then 100 else round((d.total-d.remaining)*100.0/d.total) end repair_percent,
 (r.ready_at at time zone 'Asia/Kuala_Lumpur')::date=p_date ready_today
 from public.checkout_rooms r join public.blocks b on b.id=r.block_id
 left join public.profiles m on m.id=r.assigned_to left join public.profiles c on c.id=r.cleaner_id
 left join defect_counts d on d.checkout_room_id=r.id left join history h on h.checkout_room_id=r.id
 where r.deleted_at is null and r.batch_archived_at is null and (r.created_at at time zone 'Asia/Kuala_Lumpur')::date<=p_date
 and (p_group='ALL' or (p_group='AB' and b.code in ('A','B')) or (p_group='CD' and b.code in ('C','D')))
), enriched as (
 select *,maintenance_status='Completed' and (repaired_at at time zone 'Asia/Kuala_Lumpur')::date=p_date maintenance_today,
 cleaner_status='Completed' and (cleaned_at at time zone 'Asia/Kuala_Lumpur')::date=p_date cleaner_today from rows
)
select jsonb_build_object('date',p_date,'total',count(*),'ready',count(*) filter(where status='ready_for_occupancy'),
 'ready_today',count(*) filter(where ready_today),'maintenance_completed',count(*) filter(where maintenance_status='Completed'),
 'maintenance_today',count(*) filter(where maintenance_today),'pending_material',count(*) filter(where maintenance_status='Pending Material'),
 'cleaner_total',count(*) filter(where cleaner_status<>'Not handed to cleaning'),'cleaner_completed',count(*) filter(where cleaner_status='Completed'),'cleaner_today',count(*) filter(where cleaner_today),
 'cleaner_in_progress',count(*) filter(where cleaner_status='In Progress'),
 'rooms',coalesce(jsonb_agg(to_jsonb(enriched) order by block,room_no),'[]'::jsonb)) from enriched
$function$
;

-- Generated reports are permanent batch records, protected from generic document deletion.
create function public.protect_checkout_report_document() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.checkout_batches where summary_document_id=old.id or details_document_id=old.id) then raise exception 'Batch reports are retained in Batch History and cannot be deleted';end if;
 return old;
end $$;
revoke all on function public.protect_checkout_report_document() from public,anon,authenticated;
create trigger protect_checkout_report_document before delete on public.system_documents for each row execute function public.protect_checkout_report_document();
drop policy "management delete document files" on storage.objects;
create policy "management delete document files" on storage.objects for delete to authenticated using(bucket_id='system-documents' and public.is_management() and not exists(select 1 from public.system_documents d join public.checkout_batches b on d.id in (b.summary_document_id,b.details_document_id) where d.storage_path=storage.objects.name));

alter table public.system_documents drop constraint if exists system_documents_category_check;
alter table public.system_documents add constraint system_documents_category_check check(category is null or category in (
 'Bomba Approved Plans','Approved Passive Plans','Fire Protection Systems','Room Layout & Information','Room Photos & Mock-ups','Site Plans & Survey','Furniture & Damage Charges','Lift Documents','Clinic Plans','Other Documents','Check-out Batch Reports'));
