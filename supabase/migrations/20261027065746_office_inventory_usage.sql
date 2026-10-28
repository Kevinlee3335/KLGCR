-- Append-only office withdrawals; stock deduction and history commit together.
create table public.office_inventory_usage (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null,
 inventory_item_id uuid not null references public.inventory_items(id),
 item_code text not null,description text not null,unit text,
 taken_by_name text not null check(length(btrim(taken_by_name)) between 1 and 100),
 recorded_by uuid not null references public.profiles(id),recorded_by_name text not null,
 qty numeric not null check(qty>0 and qty<=1000000),
 balance_before numeric not null,balance_after numeric not null check(balance_after>=0),
 note text not null default '',taken_at timestamptz not null default now(),
 unique(recorded_by,request_id)
);
create index office_usage_time_idx on public.office_inventory_usage(taken_at desc,id desc);
create index office_usage_recorder_idx on public.office_inventory_usage(recorded_by,taken_at desc);
alter table public.office_inventory_usage enable row level security;
revoke all on public.office_inventory_usage from public,anon,authenticated;
grant select on public.office_inventory_usage to authenticated;
create policy "office usage history access" on public.office_inventory_usage for select to authenticated
 using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.deleted_at is null and (p.role in ('admin','management_viewer') or (p.role in ('maintenance_staff','cleaner') and recorded_by=p.id))));

create function public.take_office_inventory(p_request_id uuid,p_item_id uuid,p_qty numeric,p_taken_by text,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles;item public.inventory_items;previous public.office_inventory_usage;entry public.office_inventory_usage;
begin
 select * into actor from public.profiles where id=auth.uid() and is_active and deleted_at is null and role in ('admin','maintenance_staff','cleaner');
 if not found then raise exception 'Employee access required';end if;
 if p_request_id is null or p_item_id is null or p_qty is null or p_qty::text in ('NaN','Infinity','-Infinity') or p_qty<=0 or p_qty>1000000 or p_qty<>round(p_qty,2) then raise exception 'Enter a valid quantity (up to two decimal places)';end if;
 if p_taken_by is null or length(btrim(p_taken_by)) not between 1 and 100 or length(coalesce(p_note,''))>500 then raise exception 'Enter the name of the person taking the supplies';end if;
 -- Serialize retries for the same recorder even when a retry changes its item.
 perform pg_advisory_xact_lock(hashtextextended(actor.id::text||p_request_id::text,0));
 select * into previous from public.office_inventory_usage where recorded_by=actor.id and request_id=p_request_id;
 if found then
  if previous.inventory_item_id<>p_item_id or previous.qty<>p_qty or previous.taken_by_name<>btrim(p_taken_by) or previous.note<>btrim(coalesce(p_note,'')) then raise exception 'This submission was already recorded; start a new entry';end if;
  return to_jsonb(previous);
 end if;
 select * into item from public.inventory_items where id=p_item_id and inventory_group='office' and is_active for update;
 if not found then raise exception 'Office item is unavailable';end if;
 if item.quantity_unverified then raise exception 'Ask Admin to confirm the stock quantity and unit first';end if;
 if item.balance_qty<p_qty then raise exception 'Not enough stock available';end if;
 update public.inventory_items set balance_qty=balance_qty-p_qty,updated_at=now() where id=item.id;
 insert into public.office_inventory_usage(request_id,inventory_item_id,item_code,description,unit,taken_by_name,recorded_by,recorded_by_name,qty,balance_before,balance_after,note)
 values(p_request_id,item.id,item.item_code,item.description,item.unit,btrim(p_taken_by),actor.id,actor.full_name,p_qty,item.balance_qty,item.balance_qty-p_qty,btrim(coalesce(p_note,''))) returning * into entry;
 return to_jsonb(entry);
end $$;
revoke all on function public.take_office_inventory(uuid,uuid,numeric,text,text) from public,anon;
grant execute on function public.take_office_inventory(uuid,uuid,numeric,text,text) to authenticated;
