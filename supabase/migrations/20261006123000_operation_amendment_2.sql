-- KLG Operation System Amendment (2): Daily Task categories.
-- This migration is additive and retains existing Daily Task records.

alter table public.admin_daily_tasks
  add column if not exists task_category text not null default 'admin';
alter table public.admin_daily_tasks
  drop constraint if exists admin_daily_tasks_task_category_check;
alter table public.admin_daily_tasks
  add constraint admin_daily_tasks_task_category_check
  check (task_category in ('admin','operation','housekeeping'));
create index if not exists admin_daily_tasks_category_date_idx
  on public.admin_daily_tasks(task_category, task_date desc, created_at desc);

alter table public.recurring_daily_tasks
  add column if not exists task_category text not null default 'admin';
alter table public.recurring_daily_tasks
  drop constraint if exists recurring_daily_tasks_task_category_check;
alter table public.recurring_daily_tasks
  add constraint recurring_daily_tasks_task_category_check
  check (task_category in ('admin','operation','housekeeping'));

create or replace function public.materialize_recurring_tasks(p_date date default (now() at time zone 'Asia/Kuala_Lumpur')::date)
returns void language sql security invoker set search_path='' as $$
  insert into public.admin_daily_tasks(task_date,title,notes,assigned_to,created_by,recurrence_id,task_category)
  select p_date,title,notes,assigned_to,created_by,id,task_category
  from public.recurring_daily_tasks
  where is_active and starts_on<=p_date
    and exists(select 1 from public.profiles p where p.id=assigned_to and p.is_active and p.deleted_at is null)
    and (
      (frequency='weekly' and extract(dow from p_date)=day_number)
      or (frequency='biweekly' and extract(dow from p_date)=day_number and mod(p_date-starts_on,14)=0)
      or (frequency='monthly' and extract(day from p_date)=least(day_number,extract(day from (date_trunc('month',p_date)+interval '1 month - 1 day'))))
    )
  on conflict(recurrence_id,task_date) do nothing;
$$;
