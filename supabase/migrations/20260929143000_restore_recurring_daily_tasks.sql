-- Restore the missing Daily Task recurrence dependencies and add a two-week cycle.
create table if not exists public.recurring_daily_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(trim(title))>0),
  notes text,
  assigned_to uuid not null references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  frequency text not null,
  day_number integer not null,
  starts_on date not null,
  is_active boolean not null default true
);

alter table public.recurring_daily_tasks enable row level security;
alter table public.recurring_daily_tasks drop constraint if exists recurring_daily_tasks_frequency_check;
alter table public.recurring_daily_tasks drop constraint if exists recurring_daily_tasks_check;
alter table public.recurring_daily_tasks drop constraint if exists recurring_daily_tasks_day_number_check;
alter table public.recurring_daily_tasks add constraint recurring_daily_tasks_frequency_check check (frequency in ('weekly','biweekly','monthly'));
alter table public.recurring_daily_tasks add constraint recurring_daily_tasks_day_number_check check (
  (frequency in ('weekly','biweekly') and day_number between 0 and 6)
  or (frequency='monthly' and day_number between 1 and 31)
);

drop policy if exists "management reads recurring tasks" on public.recurring_daily_tasks;
drop policy if exists "admin manages recurring tasks" on public.recurring_daily_tasks;
create policy "management reads recurring tasks" on public.recurring_daily_tasks for select to authenticated using(public.is_management());
create policy "admin manages recurring tasks" on public.recurring_daily_tasks for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.recurring_daily_tasks to authenticated;

alter table public.admin_daily_tasks add column if not exists recurrence_id uuid references public.recurring_daily_tasks(id);
create unique index if not exists admin_daily_tasks_recurrence_date_idx on public.admin_daily_tasks(recurrence_id,task_date);
create index if not exists admin_daily_tasks_assignee_date_idx on public.admin_daily_tasks(assigned_to,task_date);

create or replace function public.materialize_recurring_tasks(p_date date default (now() at time zone 'Asia/Kuala_Lumpur')::date)
returns void language sql security invoker set search_path='' as $$
  insert into public.admin_daily_tasks(task_date,title,notes,assigned_to,created_by,recurrence_id)
  select p_date,title,notes,assigned_to,created_by,id
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
revoke all on function public.materialize_recurring_tasks(date) from public;
grant execute on function public.materialize_recurring_tasks(date) to authenticated;
