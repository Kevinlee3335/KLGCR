-- Close or correct individual unissued lines without touching stock or sibling lines.
alter table public.material_request_items
  add column line_status text not null default 'active' check (line_status in ('active','rejected','cancelled')),
  add column decision_reason text,
  add column decided_by uuid references public.profiles(id),
  add column decided_at timestamptz;

create table public.material_request_item_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.material_requests(id) on delete restrict,
  request_item_id uuid not null references public.material_request_items(id) on delete restrict,
  action text not null check (action in ('edit','reject','cancel')),
  old_values jsonb not null,
  new_values jsonb not null,
  reason text not null check (length(trim(reason)) between 1 and 1000),
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index material_request_item_history_request_idx on public.material_request_item_history(request_id,created_at desc);
alter table public.material_request_item_history enable row level security;
create policy "Management and request owner read item decisions" on public.material_request_item_history
  for select to authenticated using (exists(select 1 from public.material_requests r where r.id=request_id and (public.is_management() or r.requested_by=auth.uid())));
revoke all on public.material_request_item_history from public,anon,authenticated;
grant select on public.material_request_item_history to authenticated;

-- Internal helper: callers hold the parent request lock. Closed lines never remain pending.
create function public.refresh_material_request_status(p_request_id uuid)
returns void language plpgsql set search_path='' as $$
begin
  update public.material_requests set status=case
    when exists(select 1 from public.material_request_items where request_id=p_request_id and line_status='active' and coalesce(approved_qty,0)=0) then 'pending'::public.material_request_status
    when exists(select 1 from public.material_request_items where request_id=p_request_id and line_status='active' and approved_qty>coalesce(issued_qty,0)) then 'approved'::public.material_request_status
    when exists(select 1 from public.material_request_items where request_id=p_request_id and coalesce(issued_qty,0)>0) then 'issued'::public.material_request_status
    else 'rejected'::public.material_request_status end where id=p_request_id;
end $$;
revoke all on function public.refresh_material_request_status(uuid) from public,anon,authenticated;

create function public.amend_material_request_item(
  p_request_id uuid,p_item_id uuid,p_action text,p_reason text,
  p_expected_inventory_item_id uuid,p_expected_requested_qty numeric,p_expected_approved_qty numeric,
  p_inventory_item_id uuid default null,p_requested_qty numeric default null)
returns void language plpgsql security definer set search_path='' as $$
declare line public.material_request_items%rowtype; before_values jsonb; after_values jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_action is null or p_action not in ('edit','reject','cancel') then raise exception 'Unknown item action'; end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 1000 then raise exception 'Enter a reason (1 to 1000 characters)'; end if;
  perform 1 from public.material_requests where id=p_request_id and status in ('pending','approved') for update;
  if not found then raise exception 'Open material request not found'; end if;
  select * into line from public.material_request_items where id=p_item_id and request_id=p_request_id for update;
  if not found or line.line_status<>'active' then raise exception 'Open material item not found'; end if;
  if coalesce(line.issued_qty,0)>0 then raise exception 'Issued items cannot be changed or cancelled'; end if;
  if line.inventory_item_id is distinct from p_expected_inventory_item_id
    or line.requested_qty is distinct from p_expected_requested_qty
    or line.approved_qty is distinct from p_expected_approved_qty then
    raise exception 'This item has changed. Refresh the page and review it again';
  end if;
  select to_jsonb(i)||jsonb_build_object('item_code',s.item_code,'description',coalesce(s.description,i.other_item_name),'unit',s.unit)
    into before_values from public.material_request_items i left join public.inventory_items s on s.id=i.inventory_item_id where i.id=p_item_id;
  if p_action='edit' then
    if p_requested_qty is null or p_requested_qty<=0 or p_requested_qty>9999999999.99 or p_requested_qty<>round(p_requested_qty,2) then raise exception 'Enter a positive quantity with up to 2 decimal places'; end if;
    if not exists(select 1 from public.inventory_items where id=p_inventory_item_id and is_active) then raise exception 'Select an active inventory item'; end if;
    if line.inventory_item_id=p_inventory_item_id and line.requested_qty=p_requested_qty then raise exception 'No material or quantity changes were made'; end if;
    if exists(select 1 from public.material_request_items where request_id=p_request_id and inventory_item_id=p_inventory_item_id and id<>p_item_id) then raise exception 'This material already exists in this request'; end if;
    update public.material_request_items set inventory_item_id=p_inventory_item_id,requested_qty=p_requested_qty,
      approved_qty=null,approved_by=null,approved_at=null,decided_by=auth.uid(),decided_at=now(),decision_reason=trim(p_reason) where id=p_item_id;
  else
    if p_action='reject' and coalesce(line.approved_qty,0)>0 then raise exception 'Use Cancel Approval for an approved item'; end if;
    if p_action='cancel' and coalesce(line.approved_qty,0)=0 then raise exception 'Use Reject Item for a pending item'; end if;
    update public.material_request_items set line_status=case when p_action='reject' then 'rejected' else 'cancelled' end,
      decision_reason=trim(p_reason),decided_by=auth.uid(),decided_at=now() where id=p_item_id;
  end if;
  select to_jsonb(i)||jsonb_build_object('item_code',s.item_code,'description',coalesce(s.description,i.other_item_name),'unit',s.unit)
    into after_values from public.material_request_items i left join public.inventory_items s on s.id=i.inventory_item_id where i.id=p_item_id;
  insert into public.material_request_item_history(request_id,request_item_id,action,old_values,new_values,reason,actor_id)
    values(p_request_id,p_item_id,p_action,before_values,after_values,trim(p_reason),auth.uid());
  perform public.refresh_material_request_status(p_request_id);
  update public.material_requests set reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id;
end $$;
revoke all on function public.amend_material_request_item(uuid,uuid,text,text,uuid,numeric,numeric,uuid,numeric) from public,anon;
grant execute on function public.amend_material_request_item(uuid,uuid,text,text,uuid,numeric,numeric,uuid,numeric) to authenticated;

create or replace function public.approve_material_request_item(p_request_id uuid,p_item_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare line record; stock numeric;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 perform 1 from public.material_requests where id=p_request_id and status in ('pending','approved') for update;
 if not found then raise exception 'Open material request not found'; end if;
 select * into line from public.material_request_items where id=p_item_id and request_id=p_request_id for update;
 if not found or line.line_status<>'active' or coalesce(line.approved_qty,0)>0 or coalesce(line.issued_qty,0)>0 then raise exception 'Pending material item not found'; end if;
 if line.inventory_item_id is null then raise exception 'Match this material to stock before approval'; end if;
 select balance_qty into stock from public.inventory_items where id=line.inventory_item_id and is_active for update;
 if not found or stock<line.requested_qty then raise exception 'Insufficient stock. Leave this item pending until stock arrives'; end if;
 update public.material_request_items set approved_qty=requested_qty,approved_by=auth.uid(),approved_at=now() where id=p_item_id;
 perform public.refresh_material_request_status(p_request_id);
 update public.material_requests set reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id;
end $$;
revoke all on function public.approve_material_request_item(uuid,uuid) from public,anon;
grant execute on function public.approve_material_request_item(uuid,uuid) to authenticated;

create or replace function public.issue_material_request_items(p_request_id uuid,p_item_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare line record; source record; before_qty numeric; amount numeric; issued_count integer:=0;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 select job_id,checkout_room_id,requested_by into source from public.material_requests where id=p_request_id and status in ('pending','approved') for update;
 if not found then raise exception 'Approved request not found'; end if;
 for line in select * from public.material_request_items where request_id=p_request_id and line_status='active' and approved_qty>coalesce(issued_qty,0) and (p_item_id is null or id=p_item_id) order by inventory_item_id,id for update loop
  if line.inventory_item_id is null then raise exception 'Match Other materials to stock before issuing'; end if;
  amount:=line.approved_qty-coalesce(line.issued_qty,0);
  select balance_qty into before_qty from public.inventory_items where id=line.inventory_item_id for update;
  if not found or before_qty<amount then raise exception 'Insufficient inventory for item %',line.inventory_item_id; end if;
  update public.inventory_items set balance_qty=balance_qty-amount where id=line.inventory_item_id;
  update public.material_request_items set issued_qty=approved_qty where id=line.id;
  insert into public.inventory_issue_history(request_id,job_id,checkout_room_id,inventory_item_id,staff_id,qty,balance_before,balance_after,issued_by) values(p_request_id,source.job_id,source.checkout_room_id,line.inventory_item_id,source.requested_by,amount,before_qty,before_qty-amount,auth.uid());
  issued_count:=issued_count+1;
 end loop;
 if issued_count=0 then raise exception 'No approved materials awaiting issue'; end if;
 perform public.refresh_material_request_status(p_request_id);
 update public.material_requests set issued_by=auth.uid(),issued_at=now() where id=p_request_id;
end $$;
revoke all on function public.issue_material_request_items(uuid,uuid) from public,anon;
grant execute on function public.issue_material_request_items(uuid,uuid) to authenticated;
create or replace function public.issue_material_request(p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin perform public.issue_material_request_items(p_request_id,null); end $$;

create or replace function public.review_material_request(p_request_id uuid,p_approve boolean,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 perform 1 from public.material_requests where id=p_request_id and status='pending' for update;
 if not found then raise exception 'Pending request not found'; end if;
 if not p_approve and exists(select 1 from public.material_request_items where request_id=p_request_id and line_status='active' and (coalesce(approved_qty,0)>0 or coalesce(issued_qty,0)>0)) then raise exception 'This request has approved or issued items. Leave remaining items pending'; end if;
 if not p_approve and nullif(trim(p_reason),'') is null then raise exception 'Rejection reason is required'; end if;
 update public.material_requests set status=case when p_approve then 'approved'::public.material_request_status else 'rejected'::public.material_request_status end,reviewed_by=auth.uid(),reviewed_at=now(),rejection_reason=case when p_approve then null else trim(p_reason) end where id=p_request_id;
 if p_approve then update public.material_request_items set approved_qty=requested_qty,approved_by=auth.uid(),approved_at=now() where request_id=p_request_id and line_status='active' and coalesce(approved_qty,0)=0; end if;
 if p_approve then perform public.refresh_material_request_status(p_request_id); end if;
end $$;

-- Preserve the existing match endpoint while preventing changes to closed or issued lines.
create or replace function public.match_other_material(p_request_id uuid,p_request_item_id uuid,p_inventory_item_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  perform 1 from public.material_requests where id=p_request_id and status in ('pending','approved') for update;
  if not found then raise exception 'Open material request not found'; end if;
  if not exists(select 1 from public.inventory_items where id=p_inventory_item_id and is_active) then raise exception 'Active inventory item not found'; end if;
  update public.material_request_items set inventory_item_id=p_inventory_item_id
    where id=p_request_item_id and request_id=p_request_id and inventory_item_id is null and other_item_name is not null
    and line_status='active' and coalesce(issued_qty,0)=0 and coalesce(approved_qty,0)=0;
  if not found then raise exception 'Pending unmatched item not found'; end if;
end $$;
revoke all on function public.match_other_material(uuid,uuid,uuid) from public,anon;
grant execute on function public.match_other_material(uuid,uuid,uuid) to authenticated;

-- Older installations use this guard; cancelled unmatched lines must not block completion.
create or replace function public.require_stock_before_issue()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.status='issued' and old.status<>'issued' and exists(select 1 from public.material_request_items where request_id=new.id and inventory_item_id is null and line_status='active') then
    raise exception 'Match Other items to inventory before issuing material';
  end if;
  return new;
end $$;
revoke all on function public.require_stock_before_issue() from public,anon,authenticated;
