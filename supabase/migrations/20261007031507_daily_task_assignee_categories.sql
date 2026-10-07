-- Daily Task categories follow the selected employee automatically.
-- Existing assignments stay assigned to the same person; only their category is updated.
alter table public.profiles
  add column if not exists daily_task_category text;

alter table public.profiles
  drop constraint if exists profiles_daily_task_category_check;

alter table public.profiles
  add constraint profiles_daily_task_category_check
  check (daily_task_category is null or daily_task_category in ('admin', 'operation', 'housekeeping'));

-- Kevin and Fikri are Operation even though their account role is Admin.
-- All other Admin accounts remain Admin, Maintenance is Operation, and Cleaner is Housekeeping.
update public.profiles
set daily_task_category = case
  when lower(trim(full_name)) in ('kevin lee', 'fikri') then 'operation'
  when role = 'cleaner' then 'housekeeping'
  when role = 'maintenance_staff' then 'operation'
  when role = 'admin' then 'admin'
  else daily_task_category
end
where is_active = true
  and deleted_at is null;

-- Reclassify all existing assigned Daily Tasks without changing the assignee,
-- task details, status, or history.
update public.admin_daily_tasks as task
set task_category = profile.daily_task_category
from public.profiles as profile
where profile.id = task.assigned_to
  and profile.daily_task_category is not null
  and task.task_category is distinct from profile.daily_task_category;

update public.recurring_daily_tasks as task
set task_category = profile.daily_task_category
from public.profiles as profile
where profile.id = task.assigned_to
  and profile.daily_task_category is not null
  and task.task_category is distinct from profile.daily_task_category;
