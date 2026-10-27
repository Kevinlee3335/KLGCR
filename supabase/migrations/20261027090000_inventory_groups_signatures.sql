-- Additive inventory split: legacy rows retain their Building Material classification.
alter table public.inventory_items add column inventory_group text not null default 'building' check(inventory_group in ('building','office','cleaner'));
alter table public.inventory_items add column source_details jsonb;
alter table public.inventory_items add column quantity_unverified boolean not null default false;
create index inventory_group_code_idx on public.inventory_items(inventory_group,item_code);
create function public.inventory_code_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.inventory_group='office' and new.item_code !~ '^OFF-[0-9]{4,}$') or (new.inventory_group='cleaner' and new.item_code !~ '^CLN-[0-9]{4,}$') or (new.inventory_group='building' and new.item_code ~ '^(KLGCR-)?(OFF|CLN)-') then raise exception 'Use the correct independent inventory item code';end if;
 if TG_OP='UPDATE' and new.inventory_group is distinct from old.inventory_group then raise exception 'Inventory group cannot be changed';end if;
 return new;
end $$;
create trigger inventory_code_guard before insert or update on public.inventory_items for each row execute function public.inventory_code_guard();
create function public.po_approver(lines jsonb) returns uuid language plpgsql stable security invoker set search_path='' as $$
declare groups integer;store text;
begin
 select count(distinct i.inventory_group),min(i.inventory_group) into groups,store from jsonb_array_elements(lines) e join public.inventory_items i on i.id=(e->>'itemId')::uuid;
 if groups<>1 or exists(select 1 from jsonb_array_elements(lines) e where not exists(select 1 from public.inventory_items i where i.id=(e->>'itemId')::uuid)) then raise exception 'A PO must contain items from one inventory group';end if;
 return case when store='building' then 'eeab5f04-30c3-42bd-a095-58e56c814358'::uuid else '1767d3e4-c907-45fe-8ed0-e433c0d0dca7'::uuid end;
end $$;
revoke all on function public.po_approver(jsonb) from public,anon;
grant execute on function public.po_approver(jsonb) to authenticated;
create function public.po_group_guard() returns trigger language plpgsql set search_path='' as $$
begin perform public.po_approver(new.items);return new;end $$;
create trigger aa_po_group_guard before insert or update of items on public.inventory_purchase_orders for each row execute function public.po_group_guard();
create or replace function public.po_signature_guard() returns trigger language plpgsql security invoker set search_path='' as $$
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
  if auth.uid() is distinct from public.po_approver(new.items) then raise exception 'Only James can sign approval';end if;
  select signature into drawing from public.user_e_signatures where user_id=auth.uid();
  if drawing is null then raise exception 'Save your e-signature before approving';end if;
  new.approved_signature:=drawing;
 elsif new.approved_signature is distinct from old.approved_signature then raise exception 'Signed approval cannot be changed';end if;
 if TG_OP='INSERT' or changed then new.requested_at:=clock_timestamp();else new.requested_at:=old.requested_at;end if;
 return new;
end $$;
create or replace function public.guard_po_approval() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
  new.approved_at:=null;new.approved_by_user:=null;new.approved_by:='';new.approved_date:='';
 elsif new.requested_signature is distinct from old.requested_signature or new.items is distinct from old.items or new.order_date is distinct from old.order_date or new.requested_by is distinct from old.requested_by or new.requested_date is distinct from old.requested_date then
  new.approved_at:=null;new.approved_by_user:=null;new.approved_by:='';new.approved_date:='';
 elsif new.approved_at is distinct from old.approved_at or new.approved_by_user is distinct from old.approved_by_user or new.approved_by is distinct from old.approved_by or new.approved_date is distinct from old.approved_date then
  if auth.uid() is distinct from public.po_approver(new.items) or not public.is_admin() then raise exception 'Only James Ooi can approve this PO';end if;
  if old.approved_at is not null then raise exception 'PO already approved';end if;
  new.approved_at:=clock_timestamp();new.approved_by_user:=auth.uid();select full_name into new.approved_by from public.profiles where id=auth.uid();new.approved_date:=to_char(new.approved_at at time zone 'Asia/Kuala_Lumpur','YYYY-MM-DD');
 end if;
 return new;
end $$;

create or replace function public.approve_inventory_purchase_order(order_id uuid,expected_revision integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous public.inventory_purchase_orders; saved public.inventory_purchase_orders;
begin
 select * into previous from public.inventory_purchase_orders where id=order_id for update;
 if not found then raise exception 'PO not found';end if;
 if auth.uid() is distinct from public.po_approver(previous.items) or not public.is_admin() then raise exception 'Only the designated approver can approve this PO';end if;
 if previous.revision is distinct from expected_revision then raise exception 'PO changed by another user';end if;
 if previous.approved_at is not null then return to_jsonb(previous);end if;
 insert into public.inventory_po_revisions(order_id,revision,snapshot,changed_by,changed_at) values(previous.id,previous.revision,to_jsonb(previous),previous.created_by,previous.updated_at) on conflict do nothing;
 update public.inventory_purchase_orders set approved_at=now(),approved_by_user=auth.uid(),revision=revision+1,updated_at=now() where id=order_id returning * into saved;
 insert into public.inventory_po_revisions(order_id,revision,snapshot,changed_by) values(saved.id,saved.revision,to_jsonb(saved),auth.uid());
 return to_jsonb(saved);
end $$;
create or replace function po_private.notify_po_change() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;event_kind text;heading text;message text;link text;event_id uuid;
begin
 if new.approved_at is not null and (TG_OP='INSERT' or old.approved_at is null) then
  recipient:=new.created_by;event_kind:='po_approved';heading:='Purchase order approved';
  message:=new.po_no||' was approved by '||new.approved_by||'. The approved PDF is ready.';
 elsif new.approved_at is null and (TG_OP='INSERT' or new.requested_signature is distinct from old.requested_signature or new.items is distinct from old.items or new.order_date is distinct from old.order_date or new.requested_by is distinct from old.requested_by or new.requested_date is distinct from old.requested_date) then
  recipient:=public.po_approver(new.items);event_kind:='po_approval_requested';heading:='Purchase order awaiting approval';
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

-- Procurement destinations are deliberately separate from personal profile emails.
create table public.inventory_procurement_routes(
 inventory_group text primary key check(inventory_group in ('building','office','cleaner')),
 channel text not null check(channel in ('email','notification')),recipient text,recipient_ids uuid[] not null default '{}',confirmed boolean not null default false,
 check(not confirmed or (channel='email' and length(btrim(recipient))>0) or (channel='notification' and cardinality(recipient_ids)>0))
);
alter table public.inventory_procurement_routes enable row level security;
revoke all on public.inventory_procurement_routes from anon,authenticated;
grant select on public.inventory_procurement_routes to authenticated;
grant all on public.inventory_procurement_routes to service_role;
create policy "management reads procurement routes" on public.inventory_procurement_routes for select to authenticated using(public.is_management());
insert into public.inventory_procurement_routes(inventory_group,channel,recipient,recipient_ids,confirmed) values('building','email','purchasing@keanlenggroup.com','{}',true),('office','email',null,'{}',false),('cleaner','notification',null,ARRAY['7a40e00f-2e95-4c27-83d9-0f7dba788b77'::uuid,'657a0fb1-aa05-4f3c-bd67-3914313a69d1'::uuid],true);
create table public.inventory_po_dispatch(
 order_id uuid not null references public.inventory_purchase_orders(id),revision integer not null,
 inventory_group text not null,recipient text,recipient_ids uuid[] not null default '{}',status text not null check(status in ('pending','awaiting_recipient','sending','sent','failed','superseded')),
 created_at timestamptz not null default now(),sent_at timestamptz,error text,
 primary key(order_id,revision)
);
alter table public.inventory_po_dispatch enable row level security;
revoke all on public.inventory_po_dispatch from anon,authenticated;
grant select on public.inventory_po_dispatch to authenticated;
grant all on public.inventory_po_dispatch to service_role;
create policy "management reads PO dispatch" on public.inventory_po_dispatch for select to authenticated using(public.is_management());
create function po_private.queue_po_dispatch() returns trigger language plpgsql security definer set search_path='' as $$
declare store text;destination public.inventory_procurement_routes;
begin
 if new.approved_at is not null and old.approved_at is null then
  select inventory_group into strict store from public.inventory_items where id=(new.items->0->>'itemId')::uuid;
  select * into destination from public.inventory_procurement_routes where inventory_group=store and confirmed;
  insert into public.inventory_po_dispatch(order_id,revision,inventory_group,recipient,recipient_ids,status)
  values(new.id,new.revision,store,destination.recipient,coalesce(destination.recipient_ids,'{}'),case when destination.confirmed then 'pending' else 'awaiting_recipient' end) on conflict do nothing;
 end if;
 if new.revision<>old.revision then update public.inventory_po_dispatch set status='superseded' where order_id=new.id and revision<>new.revision and status in ('pending','awaiting_recipient');end if;
 return new;
end $$;
revoke all on function po_private.queue_po_dispatch() from public,anon,authenticated;
create trigger queue_po_dispatch after update on public.inventory_purchase_orders for each row execute function po_private.queue_po_dispatch();
