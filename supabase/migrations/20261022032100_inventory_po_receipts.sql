alter table public.inventory_purchase_orders add column received_quantities jsonb not null default '{}'::jsonb;
grant update(received_quantities) on public.inventory_purchase_orders to authenticated;
create table public.inventory_po_receipts(
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 order_id uuid not null references public.inventory_purchase_orders(id),
 items jsonb not null, received_by uuid not null references public.profiles(id),
 received_at timestamptz not null default now(), note text not null default '',
 sheet_status text not null default 'pending' check(sheet_status in ('pending','synced','failed')),
 sheet_error text, synced_at timestamptz
);
create index inventory_po_receipts_order_idx on public.inventory_po_receipts(order_id,received_at desc);
alter table public.inventory_po_receipts enable row level security;
revoke all on public.inventory_po_receipts from anon,authenticated;
grant select,insert on public.inventory_po_receipts to authenticated;
grant all on public.inventory_po_receipts to service_role;
create policy "management reads po receipts" on public.inventory_po_receipts for select to authenticated using(public.is_management());
create policy "admins receive purchase orders" on public.inventory_po_receipts for insert to authenticated with check(public.is_admin() and received_by=(select auth.uid()));
create function public.receive_inventory_purchase_order(payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare po public.inventory_purchase_orders; receipt public.inventory_po_receipts; entry jsonb; target uuid; q numeric; ordered numeric; prior numeric; received jsonb; lines jsonb:='[]'; label text; code text;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 select * into po from public.inventory_purchase_orders where id=(payload->>'orderId')::uuid for update;
 if not found then raise exception 'PO not found'; end if;
 select * into receipt from public.inventory_po_receipts where request_id=(payload->>'requestId')::uuid;
 if found then
  if receipt.order_id<>po.id then raise exception 'Receipt belongs to another PO'; end if;
  return jsonb_build_object('receipt',to_jsonb(receipt),'order',to_jsonb(po));
 end if;
 if po.revision is distinct from (payload->>'expectedRevision')::integer then raise exception 'PO changed. Refresh before receiving goods'; end if;
 if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 100 then raise exception 'Select at least one item'; end if;
 if (select count(*)<>count(distinct value->>'itemId') from jsonb_array_elements(payload->'items')) then raise exception 'Duplicate receiving item'; end if;
 received:=po.received_quantities;
 -- Consistent item lock order avoids deadlocks when two POs share stock items.
 for entry in select value from jsonb_array_elements(payload->'items') order by value->>'itemId' loop
  target:=(entry->>'itemId')::uuid; q:=(entry->>'quantity')::numeric;
  if q is null or q<=0 or q>1000000 or q<>round(q,2) then raise exception 'Enter a positive quantity with up to 2 decimal places'; end if;
  select sum((value->>'quantity')::numeric),min(value->>'description'),min(value->>'code') into ordered,label,code from jsonb_array_elements(po.items) where value->>'itemId'=target::text;
  prior:=coalesce((received->>target::text)::numeric,0);
  if ordered is null or q>ordered-prior then raise exception 'Arrival quantity exceeds remaining quantity for %',coalesce(label,'item'); end if;
  perform public.adjust_inventory_item(target,'stock_in'::public.inventory_adjustment_type,q,'PO '||po.po_no||' receipt '||(payload->>'requestId'));
  received:=jsonb_set(received,array[target::text],to_jsonb(prior+q),true);
  lines:=lines||jsonb_build_array(jsonb_build_object('itemId',target,'code',code,'description',label,'quantity',q));
 end loop;
 insert into public.inventory_po_receipts(request_id,order_id,items,received_by,note)
 values((payload->>'requestId')::uuid,po.id,lines,auth.uid(),left(coalesce(payload->>'note',''),500)) returning * into receipt;
 update public.inventory_purchase_orders set received_quantities=received where id=po.id returning * into po;
 return jsonb_build_object('receipt',to_jsonb(receipt),'order',to_jsonb(po));
end $$;
revoke all on function public.receive_inventory_purchase_order(jsonb) from public,anon;
grant execute on function public.receive_inventory_purchase_order(jsonb) to authenticated;
-- Editing must never erase deliveries or lower ordered quantities below receipts.
create function public.check_po_received_quantities() returns trigger language plpgsql security invoker set search_path='' as $$
declare entry record; ordered numeric;
begin
 for entry in select key,value from jsonb_each_text(old.received_quantities) loop
  select coalesce(sum((value->>'quantity')::numeric),0) into ordered from jsonb_array_elements(new.items) where value->>'itemId'=entry.key;
  if ordered<entry.value::numeric then raise exception 'Cannot remove or reduce an item below its received quantity'; end if;
 end loop;
 return new;
end $$;
create trigger check_po_received_quantities before update of items on public.inventory_purchase_orders for each row execute function public.check_po_received_quantities();
revoke all on function public.check_po_received_quantities() from public,anon,authenticated;
-- A short per-item lease serializes outgoing Sheet balance updates.
create table public.inventory_po_sheet_leases(item_id uuid primary key references public.inventory_items(id),token uuid,locked_until timestamptz);
alter table public.inventory_po_sheet_leases enable row level security;
revoke all on public.inventory_po_sheet_leases from anon,authenticated;
grant all on public.inventory_po_sheet_leases to service_role;
create function public.claim_po_sheet_item(p_item_id uuid,p_token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 insert into public.inventory_po_sheet_leases(item_id) values(p_item_id) on conflict do nothing;
 update public.inventory_po_sheet_leases set token=p_token,locked_until=now()+interval '90 seconds' where item_id=p_item_id and (locked_until is null or locked_until<now());
 return found;
end $$;
revoke all on function public.claim_po_sheet_item(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_po_sheet_item(uuid,uuid) to service_role;
-- Ignore inbound stale balances while a delivery is still waiting to reach Sheets.
create function public.import_inventory_sheet_rows(p_rows jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare r jsonb; target uuid; keep_balance boolean;
begin
 for r in select value from jsonb_array_elements(p_rows) order by value->>'item_code' loop
  select id into target from public.inventory_items where item_code=r->>'item_code' for update;
  select exists(select 1 from public.inventory_po_receipts receipt cross join lateral jsonb_array_elements(receipt.items) entry where receipt.sheet_status<>'synced' and entry->>'itemId'=target::text) into keep_balance;
  insert into public.inventory_items(item_code,description,category,movement_category,balance_qty,reorder_level,unit,is_active)
  values(r->>'item_code',r->>'description',r->>'category',(r->>'movement_category')::public.inventory_movement_category,(r->>'balance_qty')::numeric,(r->>'reorder_level')::numeric,r->>'unit',true)
  on conflict(item_code) do update set description=excluded.description,category=excluded.category,movement_category=excluded.movement_category,balance_qty=case when keep_balance then public.inventory_items.balance_qty else excluded.balance_qty end,reorder_level=excluded.reorder_level,unit=excluded.unit,is_active=true;
 end loop;
end $$;
revoke all on function public.import_inventory_sheet_rows(jsonb) from public,anon,authenticated;
grant execute on function public.import_inventory_sheet_rows(jsonb) to service_role;
-- Also protect imports from the current live webhook while the preview is tested.
create function public.protect_pending_po_sheet_balance() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user='service_role' and new.balance_qty is distinct from old.balance_qty and exists(select 1 from public.inventory_po_receipts receipt cross join lateral jsonb_array_elements(receipt.items) entry where receipt.sheet_status<>'synced' and entry->>'itemId'=old.id::text) then new.balance_qty:=old.balance_qty; end if;
 return new;
end $$;
create trigger protect_pending_po_sheet_balance before update of balance_qty on public.inventory_items for each row execute function public.protect_pending_po_sheet_balance();
revoke all on function public.protect_pending_po_sheet_balance() from public,anon,authenticated;
