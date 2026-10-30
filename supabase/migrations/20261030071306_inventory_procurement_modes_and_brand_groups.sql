-- Preserve brand records and all stock history; only purchase reminders are grouped.
alter table public.inventory_items
  add column stock_group text,
  add column procurement_mode text not null default 'maintain_stock'
    check (procurement_mode in ('maintain_stock', 'buy_when_needed'));

update public.inventory_items set stock_group = groups.name
from (values
  ('Standard Cement 50kg', array['KLGCR-B00128','KLGCR-B00162','KLGCR-B00191']),
  ('Indoor White Paint 18L', array['KLGCR-P00003','KLGCR-P00013']),
  ('Yellow Roadline Paint 5L', array['KLGCR-P00017','KLGCR-P00019']),
  ('White Roadline Paint 5L', array['KLGCR-P00024','KLGCR-P00059','KLGCR-P00062']),
  ('Sunrise Yellow Wood & Metal Paint 5L', array['KLGCR-P00043','KLGCR-P00052'])
) as groups(name, codes)
where inventory_items.item_code = any(groups.codes) and inventory_group = 'building';

create function public.set_inventory_procurement_mode(p_item_ids uuid[], p_store text, p_mode text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Administrator access required'; end if;
  if coalesce(p_store, '') not in ('building','office','cleaner') or coalesce(p_mode, '') not in ('maintain_stock','buy_when_needed') then
    raise exception 'Invalid store or purchase mode';
  end if;
  if coalesce(cardinality(p_item_ids),0) < 1 or cardinality(p_item_ids) > 1000 or array_position(p_item_ids, null) is not null then
    raise exception 'Select between 1 and 1000 materials';
  end if;
  -- Lock in a stable order. Group members change together, including members not displayed.
  perform i.id from public.inventory_items i
  where i.inventory_group=p_store and i.is_active and (
    i.id=any(p_item_ids) or i.stock_group in (
      select s.stock_group from public.inventory_items s where s.id=any(p_item_ids) and s.inventory_group=p_store and s.is_active and s.stock_group is not null
    )
  ) order by i.id for update;
  if (select count(*) from public.inventory_items where id=any(p_item_ids) and inventory_group=p_store and is_active)
    <> (select count(distinct x) from unnest(p_item_ids) x) then
    raise exception 'One or more materials are unavailable in this store';
  end if;
  update public.inventory_items i set procurement_mode=p_mode
  where i.inventory_group=p_store and i.is_active and (
    i.id=any(p_item_ids) or i.stock_group in (
      select s.stock_group from public.inventory_items s where s.id=any(p_item_ids) and s.inventory_group=p_store and s.is_active and s.stock_group is not null
    )
  );
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.set_inventory_procurement_mode(uuid[],text,text) from public, anon;
grant execute on function public.set_inventory_procurement_mode(uuid[],text,text) to authenticated;
