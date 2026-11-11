create function public.admin_dashboard_workload_counts()
returns table (
  assigned bigint,
  in_progress bigint,
  pending_material bigint,
  under_monitoring bigint,
  completed bigint,
  out_of_stock bigint,
  near_reorder bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with job_totals as (
    select count(*) filter (where status = 'assigned') as assigned,
           count(*) filter (where status = 'in_progress') as in_progress,
           count(*) filter (where status = 'pending_material') as pending_material,
           count(*) filter (where status = 'under_monitoring') as under_monitoring,
           count(*) filter (where status = 'completed') as completed
    from public.maintenance_jobs
    where status in ('assigned', 'in_progress', 'pending_material', 'under_monitoring', 'completed')
  ), stock_totals as (
    select count(*) filter (where balance_qty <= 0) as out_of_stock,
           count(*) filter (where balance_qty > 0 and balance_qty <= reorder_level) as near_reorder
    from public.inventory_items
    where is_active = true
  )
  select job_totals.*, stock_totals.*
  from job_totals cross join stock_totals
  where (select public.is_management());
$$;

revoke all on function public.admin_dashboard_workload_counts() from public, anon;
grant execute on function public.admin_dashboard_workload_counts() to authenticated;
