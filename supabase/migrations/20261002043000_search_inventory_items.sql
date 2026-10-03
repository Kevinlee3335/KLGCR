-- Search inventory item codes and descriptions without PostgREST filter parsing.
-- SECURITY INVOKER preserves the caller's existing inventory RLS permissions.
create or replace function public.search_inventory_items(
  p_search text default null,
  p_category text default null
)
returns setof public.inventory_items
language sql
stable
security invoker
set search_path = public
as $$
  select *
  from public.inventory_items
  where (nullif(trim(p_category), '') is null or category = trim(p_category))
    and (
      nullif(trim(p_search), '') is null
      or item_code ilike '%' || trim(p_search) || '%'
      or description ilike '%' || trim(p_search) || '%'
      or regexp_replace(lower(item_code), '[^a-z0-9]+', '', 'g')
           like '%' || regexp_replace(lower(trim(p_search)), '[^a-z0-9]+', '', 'g') || '%'
      or regexp_replace(lower(description), '[^a-z0-9]+', '', 'g')
           like '%' || regexp_replace(lower(trim(p_search)), '[^a-z0-9]+', '', 'g') || '%'
    )
  order by item_code;
$$;

grant execute on function public.search_inventory_items(text, text) to authenticated;
