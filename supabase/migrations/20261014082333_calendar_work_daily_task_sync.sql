-- Preserve independent task status/history when a calendar item is removed.
-- Source identity is intentionally retained without a cascading foreign key.
alter table public.admin_daily_tasks add column if not exists calendar_event_id uuid;
create unique index if not exists daily_tasks_calendar_employee_date_idx
  on public.admin_daily_tasks(calendar_event_id, assigned_to, task_date);

-- Extend the existing controlled materializer, preserving recurrence rules,
-- ownership restrictions and function grants.
do $patch$
declare
  definition text;
  marker text := E'  on conflict (recurrence_id, task_date) do nothing;';
begin
  select pg_get_functiondef('public.materialize_recurring_tasks(date)'::regprocedure) into definition;
  if position(marker in definition) = 0 then
    raise exception 'Unexpected recurring-task materializer; review before applying';
  end if;
  definition := replace(definition, marker, marker || $body$

  insert into public.admin_daily_tasks (
    task_date, title, notes, assigned_to, created_by, task_category, calendar_event_id
  )
  select p_date, event.title, event.notes, employee.id, event.created_by,
    case
      when employee.daily_task_category in ('admin','operation','housekeeping') then employee.daily_task_category
      when employee.role = 'cleaner' then 'housekeeping'
      when employee.role = 'maintenance_staff' then 'operation'
      when lower(trim(employee.full_name)) in ('kevin lee','fikri') then 'operation'
      else 'admin'
    end,
    event.id
  from public.calendar_events event
  join public.profiles employee on (
    event.assigned_to = employee.id or event.audience = 'all_staff'
  )
  where event.event_type = 'work'
    and employee.is_active and employee.deleted_at is null
    and employee.role in ('admin','management_viewer','maintenance_staff','cleaner')
    and (auth.uid() is null or v_is_admin or employee.id = auth.uid())
    and p_date between (event.starts_at at time zone 'Asia/Kuala_Lumpur')::date
      and (coalesce(event.ends_at, event.starts_at) at time zone 'Asia/Kuala_Lumpur')::date
  on conflict (calendar_event_id, assigned_to, task_date) do nothing;
$body$);
  execute definition;
end
$patch$;

-- Import existing Work arrangements without changing any existing task.
-- Existing and future work dates remain visible in All Records.
-- CALENDAR WORK BACKFILL
insert into public.admin_daily_tasks (
    task_date, title, notes, assigned_to, created_by, task_category, calendar_event_id
  )
  select due.work_date, event.title, event.notes, employee.id, event.created_by,
    case
      when employee.daily_task_category in ('admin','operation','housekeeping') then employee.daily_task_category
      when employee.role = 'cleaner' then 'housekeeping'
      when employee.role = 'maintenance_staff' then 'operation'
      when lower(trim(employee.full_name)) in ('kevin lee','fikri') then 'operation'
      else 'admin'
    end,
    event.id
  from public.calendar_events event
  cross join lateral (
    select day::date as work_date from generate_series(
      (event.starts_at at time zone 'Asia/Kuala_Lumpur')::date::timestamp,
      (coalesce(event.ends_at,event.starts_at) at time zone 'Asia/Kuala_Lumpur')::date::timestamp,
      interval '1 day'
    ) day
  ) due
  join public.profiles employee on (
    event.assigned_to = employee.id or event.audience = 'all_staff'
  )
  where event.event_type = 'work'
    and employee.is_active and employee.deleted_at is null
    and employee.role in ('admin','management_viewer','maintenance_staff','cleaner')
    and due.work_date between (event.starts_at at time zone 'Asia/Kuala_Lumpur')::date
      and (coalesce(event.ends_at, event.starts_at) at time zone 'Asia/Kuala_Lumpur')::date
  on conflict (calendar_event_id, assigned_to, task_date) do nothing;
