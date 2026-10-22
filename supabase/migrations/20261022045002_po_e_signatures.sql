create table public.user_e_signatures(
 user_id uuid primary key references public.profiles(id),
 signature jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.user_e_signatures enable row level security;
revoke all on public.user_e_signatures from anon,authenticated;
grant select,insert,update,delete on public.user_e_signatures to authenticated;
create policy "owner reads signature" on public.user_e_signatures for select to authenticated using(user_id=(select auth.uid()));
create policy "owner saves signature" on public.user_e_signatures for insert to authenticated with check(user_id=(select auth.uid()));
create policy "owner updates signature" on public.user_e_signatures for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "owner deletes signature" on public.user_e_signatures for delete to authenticated using(user_id=(select auth.uid()));
create function public.validate_e_signature() returns trigger language plpgsql security invoker set search_path='' as $$
declare stroke jsonb; point jsonb; total integer:=0;
begin
 if jsonb_typeof(new.signature->'strokes') is distinct from 'array' or jsonb_array_length(new.signature->'strokes') not between 1 and 80 then raise exception 'Draw a signature';end if;
 for stroke in select value from jsonb_array_elements(new.signature->'strokes') loop
  if jsonb_typeof(stroke) is distinct from 'array' or jsonb_array_length(stroke) not between 2 and 600 then raise exception 'Invalid signature stroke';end if;
  total:=total+jsonb_array_length(stroke);
  for point in select value from jsonb_array_elements(stroke) loop
   if jsonb_typeof(point) is distinct from 'array' or jsonb_array_length(point)<>2 or jsonb_typeof(point->0)<>'number' or jsonb_typeof(point->1)<>'number' then raise exception 'Invalid signature point';end if;
   if (point->>0)::numeric not between 0 and 1 or (point->>1)::numeric not between 0 and 1 then raise exception 'Invalid signature bounds';end if;
  end loop;
 end loop;
 if total>5000 then raise exception 'Signature too detailed';end if;
 new.updated_at:=now();return new;
end $$;
revoke all on function public.validate_e_signature() from public,anon,authenticated;
create trigger validate_e_signature before insert or update on public.user_e_signatures for each row execute function public.validate_e_signature();
alter table public.inventory_purchase_orders add column requested_signature jsonb;
alter table public.inventory_purchase_orders add column requested_signed_by uuid references public.profiles(id);
alter table public.inventory_purchase_orders add column requested_signed_at timestamptz;
alter table public.inventory_purchase_orders add column approved_signature jsonb;
grant update(requested_signature,requested_signed_by,requested_signed_at,approved_signature) on public.inventory_purchase_orders to authenticated;
create function public.po_signature_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare drawing jsonb; signer_name text; changed boolean;
begin
 changed:=TG_OP='UPDATE' and (new.items is distinct from old.items or new.order_date is distinct from old.order_date or new.requested_by is distinct from old.requested_by or new.requested_date is distinct from old.requested_date);
 if new.requested_signature='{"useSaved":true}'::jsonb then
  if auth.uid() is distinct from new.created_by then raise exception 'Only the PO creator can apply their requester signature';end if;
  select signature into drawing from public.user_e_signatures where user_id=auth.uid();
  if drawing is null then raise exception 'Save your e-signature first';end if;
  select full_name into signer_name from public.profiles where id=auth.uid() and is_active and deleted_at is null;
  if signer_name is null then raise exception 'Active signer required';end if;
  new.requested_signature:=drawing;new.requested_signed_by:=auth.uid();new.requested_signed_at:=clock_timestamp();new.requested_by:=signer_name;
 elsif TG_OP='INSERT' or changed then
  new.requested_signature:=null;new.requested_signed_by:=null;new.requested_signed_at:=null;
 else
  if new.requested_signature is distinct from old.requested_signature or new.requested_signed_by is distinct from old.requested_signed_by or new.requested_signed_at is distinct from old.requested_signed_at then raise exception 'Use your saved signature to sign';end if;
 end if;
 if new.approved_at is null then new.approved_signature:=null;
 elsif TG_OP='UPDATE' and old.approved_at is null then
  if auth.uid() is distinct from 'eeab5f04-30c3-42bd-a095-58e56c814358'::uuid then raise exception 'Only James can sign approval';end if;
  select signature into drawing from public.user_e_signatures where user_id=auth.uid();
  if drawing is null then raise exception 'Save your e-signature before approving';end if;
  new.approved_signature:=drawing;
 elsif new.approved_signature is distinct from old.approved_signature then raise exception 'Signed approval cannot be changed';end if;
 return new;
end $$;
revoke all on function public.po_signature_guard() from public,anon,authenticated;
create trigger po_signature_guard before insert or update on public.inventory_purchase_orders for each row execute function public.po_signature_guard();

create or replace function public.save_inventory_purchase_order(payload jsonb) returns jsonb
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
 insert into public.inventory_purchase_orders(request_id,po_no,order_date,requested_by,approved_by,requested_date,approved_date,items,created_by,requested_signature)
 values(rid,'KH/KLG/PO/'||yr||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0'),(payload->>'date')::date,payload->>'requestedBy',coalesce(payload->>'approvedBy',''),coalesce(payload->>'requestedDate',''),coalesce(payload->>'approvedDate',''),snapshots,auth.uid(),case when (payload->>'useSignature')::boolean then '{"useSaved":true}'::jsonb else null end) returning * into saved;
 return to_jsonb(saved);
end $$;

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
 update public.inventory_purchase_orders set order_date=(payload->>'date')::date,requested_by=payload->>'requestedBy',approved_by=previous.approved_by,requested_date=coalesce(payload->>'requestedDate',''),approved_date=previous.approved_date,items=snapshots,requested_signature=case when (payload->>'useSignature')::boolean then '{"useSaved":true}'::jsonb else previous.requested_signature end,revision=revision+1,updated_at=now() where id=previous.id returning * into saved;
 insert into public.inventory_po_revisions(order_id,revision,request_id,snapshot,changed_by) values(saved.id,saved.revision,rid,to_jsonb(saved),auth.uid());
 return to_jsonb(saved);
end $$;

create or replace function public.guard_po_approval() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
  new.approved_at:=null;new.approved_by_user:=null;new.approved_by:='';new.approved_date:='';
 elsif new.requested_signature is distinct from old.requested_signature or new.items is distinct from old.items or new.order_date is distinct from old.order_date or new.requested_by is distinct from old.requested_by or new.requested_date is distinct from old.requested_date then
  new.approved_at:=null;new.approved_by_user:=null;new.approved_by:='';new.approved_date:='';
 elsif new.approved_at is distinct from old.approved_at or new.approved_by_user is distinct from old.approved_by_user or new.approved_by is distinct from old.approved_by or new.approved_date is distinct from old.approved_date then
  if auth.uid() is distinct from 'eeab5f04-30c3-42bd-a095-58e56c814358'::uuid or not public.is_admin() then raise exception 'Only James Ooi can approve this PO';end if;
  if old.approved_at is not null then raise exception 'PO already approved';end if;
  new.approved_at:=clock_timestamp();new.approved_by_user:=auth.uid();new.approved_by:='James Ooi';new.approved_date:=to_char(new.approved_at at time zone 'Asia/Kuala_Lumpur','YYYY-MM-DD');
 end if;
 return new;
end $$;

create or replace function po_private.notify_po_change() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;event_kind text;heading text;message text;link text;event_id uuid;
begin
 if new.approved_at is not null and (TG_OP='INSERT' or old.approved_at is null) then
  recipient:=new.created_by;event_kind:='po_approved';heading:='Purchase order approved';
  message:=new.po_no||' was approved by James Ooi. The approved PDF is ready to send to HQ.';
 elsif new.approved_at is null and (TG_OP='INSERT' or new.requested_signature is distinct from old.requested_signature or new.items is distinct from old.items or new.order_date is distinct from old.order_date or new.requested_by is distinct from old.requested_by or new.requested_date is distinct from old.requested_date) then
  recipient:='eeab5f04-30c3-42bd-a095-58e56c814358';event_kind:='po_approval_requested';heading:='Purchase order awaiting approval';
  message:=new.po_no||' · Requested by '||new.requested_by||'. Please review and approve.';
 else return new;end if;
 if not exists(select 1 from public.profiles where id=recipient and is_active and deleted_at is null) then return new;end if;
 link:='/admin/inventory/purchase-orders?po='||new.id;
 insert into public.inventory_po_notification_outbox(order_id,revision,kind,recipient_id,title,body,href)
 values(new.id,new.revision,event_kind,recipient,heading,message,link) on conflict do nothing returning id into event_id;
 if event_id is not null then
  insert into public.app_notifications(recipient_id,type,title,body,href,entity_id) values(recipient,event_kind,heading,message,link,new.id);
 end if;
 return new;
end $$;
