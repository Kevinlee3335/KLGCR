alter table public.inventory_purchase_orders add column requested_at timestamptz not null default now();
update public.inventory_purchase_orders set requested_at=created_at;
create or replace function public.po_signature_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare changed boolean;
begin
 changed:=TG_OP='UPDATE' and (new.items is distinct from old.items or new.order_date is distinct from old.order_date or new.requested_by is distinct from old.requested_by or new.requested_date is distinct from old.requested_date);
 if new.requested_signature='{"useSaved":true}'::jsonb then raise exception 'E-signature is temporarily hidden. Refresh and save without a signature';end if;
 if TG_OP='INSERT' or changed then
  new.requested_signature:=null;new.requested_signed_by:=null;new.requested_signed_at:=null;new.requested_at:=clock_timestamp();
 else
  if new.requested_signature is distinct from old.requested_signature or new.requested_signed_by is distinct from old.requested_signed_by or new.requested_signed_at is distinct from old.requested_signed_at then raise exception 'E-signature is temporarily hidden';end if;
  new.requested_at:=old.requested_at;
 end if;
 if new.approved_at is null or (TG_OP='UPDATE' and old.approved_at is null) then new.approved_signature:=null;
 elsif new.approved_signature is distinct from old.approved_signature then raise exception 'Signed approval cannot be changed';end if;
 return new;
end $$;
