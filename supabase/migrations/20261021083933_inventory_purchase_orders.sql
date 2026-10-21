create table public.inventory_po_counters (
 year integer primary key check (year between 2026 and 9999),
 last_number integer not null check (last_number between 0 and 999999)
);
insert into public.inventory_po_counters values (2026,29);
create table public.inventory_purchase_orders (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 po_no text not null unique,
 order_date date not null,
 requested_by text not null,
 approved_by text not null default '',
 requested_date text not null default '',
 approved_date text not null default '',
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 100),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table public.inventory_po_counters enable row level security;
alter table public.inventory_purchase_orders enable row level security;
revoke all on public.inventory_po_counters,public.inventory_purchase_orders from anon,authenticated;
grant select,insert,update on public.inventory_po_counters to authenticated;
grant select,insert on public.inventory_purchase_orders to authenticated;
create policy "admin po counters" on public.inventory_po_counters for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "management reads purchase orders" on public.inventory_purchase_orders for select to authenticated using(public.is_management());
create policy "admins create purchase orders" on public.inventory_purchase_orders for insert to authenticated with check(public.is_admin() and created_by=(select auth.uid()));
create function public.save_inventory_purchase_order(payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 yr integer; seq integer; existing public.inventory_purchase_orders; saved public.inventory_purchase_orders;
 entry jsonb; item public.inventory_items; snapshots jsonb:='[]'::jsonb; q numeric; rid uuid;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 rid:=(payload->>'requestId')::uuid;
 yr:=extract(year from (now() at time zone 'Asia/Kuala_Lumpur'))::integer;
 if extract(year from (payload->>'date')::date)::integer<>yr then raise exception 'PO date must be in the current year'; end if;
 insert into public.inventory_po_counters(year,last_number) values(yr,0) on conflict(year) do nothing;
 -- Serialize allocation and retry detection in the same transaction.
 perform 1 from public.inventory_po_counters where year=yr for update;
 select * into existing from public.inventory_purchase_orders where request_id=rid;
 if found then return to_jsonb(existing); end if;
 if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 100 then raise exception 'Invalid items'; end if;
 if length(btrim(coalesce(payload->>'requestedBy','')))=0 or length(payload->>'requestedBy')>100 then raise exception 'Requester required'; end if;
 for entry in select value from jsonb_array_elements(payload->'items') loop
  select * into item from public.inventory_items where id=(entry->>'itemId')::uuid and is_active;
  if not found then raise exception 'Inventory item unavailable'; end if;
  q:=(entry->>'quantity')::numeric;
  if q is null or q<=0 or q>1000000 then raise exception 'Invalid quantity'; end if;
  if length(coalesce(entry->>'specification',''))>200 or length(coalesce(entry->>'location',''))>200 then raise exception 'Item text too long'; end if;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('itemId',item.id,'code',item.item_code,'description',item.description,'unit',coalesce(item.unit,''),'quantity',q,'specification',coalesce(entry->>'specification',''),'location',coalesce(entry->>'location','')));
 end loop;
 update public.inventory_po_counters set last_number=last_number+1 where year=yr returning last_number into seq;
 insert into public.inventory_purchase_orders(request_id,po_no,order_date,requested_by,approved_by,requested_date,approved_date,items,created_by)
 values(rid,'KH/KLG/PO/'||yr||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0'),(payload->>'date')::date,payload->>'requestedBy',coalesce(payload->>'approvedBy',''),coalesce(payload->>'requestedDate',''),coalesce(payload->>'approvedDate',''),snapshots,auth.uid()) returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function public.save_inventory_purchase_order(jsonb) from public,anon;
grant execute on function public.save_inventory_purchase_order(jsonb) to authenticated;
-- PDF archives are private and served only through the authenticated PO route.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('inventory-po-pdfs','inventory-po-pdfs',false,10485760,array['application/pdf']) on conflict(id) do nothing;
