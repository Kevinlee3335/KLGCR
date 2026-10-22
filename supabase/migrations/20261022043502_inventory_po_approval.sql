alter table public.inventory_purchase_orders add column approved_at timestamptz;
alter table public.inventory_purchase_orders add column approved_by_user uuid references public.profiles(id);
grant update(approved_at,approved_by_user) on public.inventory_purchase_orders to authenticated;
-- The trigger validates identity even for direct Data API writes and legacy clients.
create function public.guard_po_approval() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
  new.approved_at:=null;new.approved_by_user:=null;new.approved_by:='';new.approved_date:='';
 elsif new.items is distinct from old.items or new.order_date is distinct from old.order_date or new.requested_by is distinct from old.requested_by or new.requested_date is distinct from old.requested_date then
  new.approved_at:=null;new.approved_by_user:=null;new.approved_by:='';new.approved_date:='';
 elsif new.approved_at is distinct from old.approved_at or new.approved_by_user is distinct from old.approved_by_user or new.approved_by is distinct from old.approved_by or new.approved_date is distinct from old.approved_date then
  if auth.uid() is distinct from 'eeab5f04-30c3-42bd-a095-58e56c814358'::uuid or not public.is_admin() then raise exception 'Only James Ooi can approve this PO';end if;
  if old.approved_at is not null then raise exception 'PO already approved';end if;
  new.approved_at:=clock_timestamp();new.approved_by_user:=auth.uid();new.approved_by:='James Ooi';new.approved_date:=to_char(new.approved_at at time zone 'Asia/Kuala_Lumpur','YYYY-MM-DD');
 end if;
 return new;
end $$;
revoke all on function public.guard_po_approval() from public,anon,authenticated;
create trigger guard_po_approval before insert or update on public.inventory_purchase_orders for each row execute function public.guard_po_approval();
create function public.approve_inventory_purchase_order(order_id uuid,expected_revision integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous public.inventory_purchase_orders; saved public.inventory_purchase_orders;
begin
 if auth.uid() is distinct from 'eeab5f04-30c3-42bd-a095-58e56c814358'::uuid or not public.is_admin() then raise exception 'Only James Ooi can approve this PO';end if;
 select * into previous from public.inventory_purchase_orders where id=order_id for update;
 if not found then raise exception 'PO not found';end if;
 if previous.revision is distinct from expected_revision then raise exception 'PO changed by another user';end if;
 if previous.approved_at is not null then return to_jsonb(previous);end if;
 insert into public.inventory_po_revisions(order_id,revision,snapshot,changed_by,changed_at) values(previous.id,previous.revision,to_jsonb(previous),previous.created_by,previous.updated_at) on conflict do nothing;
 update public.inventory_purchase_orders set approved_at=now(),approved_by_user=auth.uid(),revision=revision+1,updated_at=now() where id=order_id returning * into saved;
 insert into public.inventory_po_revisions(order_id,revision,snapshot,changed_by) values(saved.id,saved.revision,to_jsonb(saved),auth.uid());
 return to_jsonb(saved);
end $$;
revoke all on function public.approve_inventory_purchase_order(uuid,integer) from public,anon;
grant execute on function public.approve_inventory_purchase_order(uuid,integer) to authenticated;

create or replace function public.edit_inventory_purchase_order(payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 previous public.inventory_purchase_orders; saved public.inventory_purchase_orders;
 entry jsonb; item public.inventory_items; old_item jsonb; snapshots jsonb:='[]'::jsonb; q numeric; rid uuid;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 rid:=(payload->>'requestId')::uuid;
 select * into previous from public.inventory_purchase_orders where id=(payload->>'orderId')::uuid for update;
 if not found then raise exception 'PO not found'; end if;
 if exists(select 1 from public.inventory_po_revisions where request_id=rid and order_id=previous.id) then return to_jsonb(previous); end if;
 if previous.revision is distinct from (payload->>'expectedRevision')::integer then raise exception 'PO changed by another user'; end if;
 if extract(year from (payload->>'date')::date)<>extract(year from previous.order_date) then raise exception 'Keep the original PO year'; end if;
 if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 100 then raise exception 'Invalid items'; end if;
 if length(btrim(coalesce(payload->>'requestedBy','')))=0 or length(payload->>'requestedBy')>100 then raise exception 'Requester required'; end if;
 for entry in select value from jsonb_array_elements(payload->'items') loop
  old_item:=null;
  select value into old_item from jsonb_array_elements(previous.items) where value->>'itemId'=entry->>'itemId' limit 1;
  if old_item is null then
   select * into item from public.inventory_items where id=(entry->>'itemId')::uuid and is_active;
   if not found then raise exception 'Inventory item unavailable'; end if;
   old_item:=jsonb_build_object('itemId',item.id,'code',item.item_code,'description',item.description,'unit',coalesce(item.unit,''));
  end if;
  q:=(entry->>'quantity')::numeric;
  if q is null or q<=0 or q>1000000 then raise exception 'Invalid quantity'; end if;
  if length(coalesce(entry->>'specification',''))>200 or length(coalesce(entry->>'location',''))>200 then raise exception 'Item text too long'; end if;
  snapshots:=snapshots||jsonb_build_array(old_item||jsonb_build_object('quantity',q,'specification',coalesce(entry->>'specification',''),'location',coalesce(entry->>'location','')));
 end loop;
 insert into public.inventory_po_revisions(order_id,revision,snapshot,changed_by,changed_at)
 values(previous.id,previous.revision,to_jsonb(previous),previous.created_by,previous.updated_at) on conflict(order_id,revision) do nothing;
 update public.inventory_purchase_orders set order_date=(payload->>'date')::date,requested_by=payload->>'requestedBy',approved_by=previous.approved_by,requested_date=coalesce(payload->>'requestedDate',''),approved_date=previous.approved_date,items=snapshots,revision=revision+1,updated_at=now() where id=previous.id returning * into saved;
 insert into public.inventory_po_revisions(order_id,revision,request_id,snapshot,changed_by) values(saved.id,saved.revision,rid,to_jsonb(saved),auth.uid());
 return to_jsonb(saved);
end $$;
