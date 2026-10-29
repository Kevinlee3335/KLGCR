-- Item approval is separate from stock issue. Pending lines stay open across batches.
alter table public.material_request_items add column approved_by uuid references public.profiles(id);
alter table public.material_request_items add column approved_at timestamptz;
create function public.approve_material_request_item(p_request_id uuid,p_item_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare line record; stock numeric;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 perform 1 from public.material_requests where id=p_request_id and status in ('pending','approved') for update;
 if not found then raise exception 'Open material request not found'; end if;
 select * into line from public.material_request_items where id=p_item_id and request_id=p_request_id for update;
 if not found or coalesce(line.approved_qty,0)>0 or coalesce(line.issued_qty,0)>0 then raise exception 'Pending material item not found'; end if;
 if line.inventory_item_id is null then raise exception 'Match this material to stock before approval'; end if;
 select balance_qty into stock from public.inventory_items where id=line.inventory_item_id and is_active for update;
 if not found or stock<line.requested_qty then raise exception 'Insufficient stock. Leave this item pending until stock arrives'; end if;
 update public.material_request_items set approved_qty=requested_qty,approved_by=auth.uid(),approved_at=now() where id=p_item_id;
 update public.material_requests set status=case when exists(select 1 from public.material_request_items where request_id=p_request_id and coalesce(approved_qty,0)=0) then 'pending'::public.material_request_status else 'approved'::public.material_request_status end,reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id;
end $$;
revoke all on function public.approve_material_request_item(uuid,uuid) from public,anon;
grant execute on function public.approve_material_request_item(uuid,uuid) to authenticated;

create function public.issue_material_request_items(p_request_id uuid,p_item_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare line record; source record; before_qty numeric; amount numeric; issued_count integer:=0;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 select job_id,checkout_room_id,requested_by into source from public.material_requests where id=p_request_id and status in ('pending','approved') for update;
 if not found then raise exception 'Approved request not found'; end if;
 for line in select * from public.material_request_items where request_id=p_request_id and approved_qty>coalesce(issued_qty,0) and (p_item_id is null or id=p_item_id) order by inventory_item_id,id for update loop
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
 update public.material_requests set status=case
 when exists(select 1 from public.material_request_items where request_id=p_request_id and coalesce(approved_qty,0)=0) then 'pending'::public.material_request_status
 when exists(select 1 from public.material_request_items where request_id=p_request_id and approved_qty>coalesce(issued_qty,0)) then 'approved'::public.material_request_status
 else 'issued'::public.material_request_status end,issued_by=auth.uid(),issued_at=now() where id=p_request_id;
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
 if not p_approve and exists(select 1 from public.material_request_items where request_id=p_request_id and (coalesce(approved_qty,0)>0 or coalesce(issued_qty,0)>0)) then raise exception 'This request has approved or issued items. Leave remaining items pending'; end if;
 if not p_approve and nullif(trim(p_reason),'') is null then raise exception 'Rejection reason is required'; end if;
 update public.material_requests set status=case when p_approve then 'approved'::public.material_request_status else 'rejected'::public.material_request_status end,reviewed_by=auth.uid(),reviewed_at=now(),rejection_reason=case when p_approve then null else trim(p_reason) end where id=p_request_id;
 if p_approve then update public.material_request_items set approved_qty=requested_qty,approved_by=auth.uid(),approved_at=now() where request_id=p_request_id and coalesce(approved_qty,0)=0; end if;
end $$;
