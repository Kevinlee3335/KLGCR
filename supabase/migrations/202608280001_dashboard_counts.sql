create or replace function public.admin_dashboard_counts()
returns table (
  new_complaints bigint,
  today_tasks bigint,
  completed_today bigint,
  outstanding bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from public.complaints where status = 'new')::bigint,
    (select count(*) from public.maintenance_jobs where assigned_at >= current_date and status not in ('completed', 'cancelled'))::bigint,
    (select count(*) from public.maintenance_jobs where status = 'completed' and completed_at >= current_date)::bigint,
    (select count(*) from public.maintenance_jobs where status in ('assigned', 'in_progress', 'pending_material', 'under_monitoring'))::bigint;
$$;

revoke all on function public.admin_dashboard_counts() from public;
grant execute on function public.admin_dashboard_counts() to authenticated;
