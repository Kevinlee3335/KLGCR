create schema if not exists po_private;
revoke all on schema po_private from public,anon,authenticated;
create table public.inventory_po_notification_outbox(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.inventory_purchase_orders(id),
 revision integer not null,
 kind text not null check(kind in ('po_approval_requested','po_approved')),
 recipient_id uuid not null references public.profiles(id),
 title text not null,body text not null,href text not null,
 created_at timestamptz not null default now(),
 delivered_at timestamptz,locked_until timestamptz,claim_token uuid,
 unique(order_id,revision,kind)
);
alter table public.inventory_po_notification_outbox enable row level security;
revoke all on public.inventory_po_notification_outbox from anon,authenticated;
grant all on public.inventory_po_notification_outbox to service_role;
-- This trigger needs owner privileges only to notify a different recipient.
-- It cannot be invoked through the Data API; all event values come from the saved row.
create function po_private.notify_po_change() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;event_kind text;heading text;message text;link text;event_id uuid;
begin
 if new.approved_at is not null and (TG_OP='INSERT' or old.approved_at is null) then
  recipient:=new.created_by;event_kind:='po_approved';heading:='Purchase order approved';
  message:=new.po_no||' was approved by James Ooi. The approved PDF is ready to send to HQ.';
 elsif new.approved_at is null and (TG_OP='INSERT' or new.items is distinct from old.items or new.order_date is distinct from old.order_date or new.requested_by is distinct from old.requested_by or new.requested_date is distinct from old.requested_date) then
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
revoke all on function po_private.notify_po_change() from public,anon,authenticated;
create trigger notify_po_change after insert or update on public.inventory_purchase_orders for each row execute function po_private.notify_po_change();
create function public.claim_po_notification(event_id uuid,token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.inventory_po_notification_outbox set locked_until=now()+interval '2 minutes',claim_token=token where id=event_id and delivered_at is null and (locked_until is null or locked_until<now());
 return found;
end $$;
revoke all on function public.claim_po_notification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_po_notification(uuid,uuid) to service_role;
