-- Keep recurring-task creation in the controlled database function.
-- Staff (including Cleaners) may trigger creation only for their own due
-- tasks; they never gain direct insert permission on admin_daily_tasks.

create or replace function public.materialize_recurring_tasks(
  p_date date default ((now() at time zone 'Asia/Kuala_Lumpur')::date)
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_is_admin boolean := public.is_admin();
begin
  if auth.uid() is not null and not v_is_admin and p_date > v_today then
    raise exception 'Daily tasks can only be opened on or after their due date';
  end if;

  insert into public.admin_daily_tasks (
    task_date, title, notes, assigned_to, created_by, recurrence_id, task_category
  )
  select
    p_date, title, notes, assigned_to, created_by, id, task_category
  from public.recurring_daily_tasks
  where is_active
    and starts_on <= p_date
    and (auth.uid() is null or v_is_admin or assigned_to = auth.uid())
    and exists (
      select 1
      from public.profiles profile
      where profile.id = assigned_to
        and profile.is_active
        and profile.deleted_at is null
    )
    and (
      (frequency = 'weekly' and extract(dow from p_date) = day_number)
      or (frequency = 'biweekly' and extract(dow from p_date) = day_number and mod(p_date - starts_on, 14) = 0)
      or (frequency = 'monthly' and extract(day from p_date) = least(day_number, extract(day from (date_trunc('month', p_date) + interval '1 month - 1 day'))))
    )
  on conflict (recurrence_id, task_date) do nothing;
end
$function$;

revoke all on function public.materialize_recurring_tasks(date) from public;
grant execute on function public.materialize_recurring_tasks(date) to authenticated;
