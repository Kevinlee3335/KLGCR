alter table public.inventory_purchase_orders add column revision integer not null default 1;
alter table public.inventory_purchase_orders add column updated_at timestamptz not null default now();
grant update(order_date,requested_by,approved_by,requested_date,approved_date,items,revision,updated_at) on public.inventory_purchase_orders to authenticated;
create policy "admins edit purchase orders" on public.inventory_purchase_orders for update to authenticated using(public.is_admin()) with check(public.is_admin());
create table public.inventory_po_revisions(
 order_id uuid not null references public.inventory_purchase_orders(id),
 revision integer not null,
 request_id uuid unique,
 snapshot jsonb not null,
 changed_by uuid not null references public.profiles(id),
 changed_at timestamptz not null default now(),
 primary key(order_id,revision)
);
alter table public.inventory_po_revisions enable row level security;
revoke all on public.inventory_po_revisions from anon,authenticated;
grant select,insert on public.inventory_po_revisions to authenticated;
create policy "management reads po revisions" on public.inventory_po_revisions for select to authenticated using(public.is_management());
create policy "admins record po revisions" on public.inventory_po_revisions for insert to authenticated with check(public.is_admin());
create function public.edit_inventory_purchase_order(payload jsonb) returns jsonb
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
 update public.inventory_purchase_orders set order_date=(payload->>'date')::date,requested_by=payload->>'requestedBy',approved_by=coalesce(payload->>'approvedBy',''),requested_date=coalesce(payload->>'requestedDate',''),approved_date=coalesce(payload->>'approvedDate',''),items=snapshots,revision=revision+1,updated_at=now() where id=previous.id returning * into saved;
 insert into public.inventory_po_revisions(order_id,revision,request_id,snapshot,changed_by) values(saved.id,saved.revision,rid,to_jsonb(saved),auth.uid());
 return to_jsonb(saved);
end $$;
revoke all on function public.edit_inventory_purchase_order(jsonb) from public,anon;
grant execute on function public.edit_inventory_purchase_order(jsonb) to authenticated;
