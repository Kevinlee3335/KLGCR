-- Cleaner Daily Task workspace: materialize recurring work safely, keep photo
-- evidence per occurrence, and allow cleaners to read only their own reports.

alter table public.admin_daily_tasks
  add column if not exists due_notification_sent_at timestamptz;

create table if not exists public.daily_task_photos (
  id uuid primary key default gen_random_uuid(),
  task_id bigint not null references public.admin_daily_tasks(id) on delete cascade,
  storage_path text not null unique,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.daily_task_photos enable row level security;
create index if not exists daily_task_photos_task_created_idx on public.daily_task_photos(task_id, created_at);
drop policy if exists "management reads daily task photos" on public.daily_task_photos;
create policy "management reads daily task photos"
on public.daily_task_photos for select to authenticated
using (
  public.is_management()
  or exists (
    select 1 from public.admin_daily_tasks task
    where task.id = task_id and task.assigned_to = (select auth.uid())
  )
);
grant select on public.daily_task_photos to authenticated;

create or replace function public.daily_task_assignee_owns_path(p_task_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.admin_daily_tasks task
    join public.profiles profile on profile.id = task.assigned_to
    where task.id::text = p_task_id
      and task.assigned_to = (select auth.uid())
      and profile.is_active
      and profile.deleted_at is null
      and profile.role in ('cleaner', 'maintenance_staff')
  ), false)
$$;
revoke all on function public.daily_task_assignee_owns_path(text) from public;
grant execute on function public.daily_task_assignee_owns_path(text) to authenticated;

drop policy if exists "daily task evidence read" on storage.objects;
create policy "daily task evidence read"
on storage.objects for select to authenticated
using (
  bucket_id = 'checkout-evidence'
  and (storage.foldername(name))[1] = 'daily-tasks'
  and (
    public.is_management()
    or public.daily_task_assignee_owns_path((storage.foldername(name))[2])
  )
);

drop policy if exists "daily task evidence upload" on storage.objects;
create policy "daily task evidence upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'checkout-evidence'
  and (storage.foldername(name))[1] = 'daily-tasks'
  and public.daily_task_assignee_owns_path((storage.foldername(name))[2])
);

drop policy if exists "daily task evidence remove" on storage.objects;
create policy "daily task evidence remove"
on storage.objects for delete to authenticated
using (
  bucket_id = 'checkout-evidence'
  and (storage.foldername(name))[1] = 'daily-tasks'
  and public.daily_task_assignee_owns_path((storage.foldername(name))[2])
);

create or replace function public.materialize_recurring_tasks(
  p_date date default ((now() at time zone 'Asia/Kuala_Lumpur')::date)
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_is_admin boolean := public.is_admin();
begin
  if auth.uid() is not null and not v_is_admin and p_date > v_today then
    raise exception 'Daily tasks can only be opened on or after their due date';
  end if;

  insert into public.admin_daily_tasks(task_date, title, notes, assigned_to, created_by, recurrence_id)
  select p_date, title, notes, assigned_to, created_by, id
  from public.recurring_daily_tasks
  where is_active
    and starts_on <= p_date
    and (auth.uid() is null or v_is_admin or assigned_to = auth.uid())
    and exists (
      select 1 from public.profiles profile
      where profile.id = assigned_to and profile.is_active and profile.deleted_at is null
    )
    and (
      (frequency = 'weekly' and extract(dow from p_date) = day_number)
      or (frequency = 'biweekly' and extract(dow from p_date) = day_number and mod(p_date - starts_on, 14) = 0)
      or (frequency = 'monthly' and extract(day from p_date) = least(day_number, extract(day from (date_trunc('month', p_date) + interval '1 month - 1 day'))))
    )
  on conflict (recurrence_id, task_date) do nothing;
end
$$;
revoke all on function public.materialize_recurring_tasks(date) from public;
grant execute on function public.materialize_recurring_tasks(date) to authenticated;

create or replace function public.complete_assigned_daily_task(
  p_id bigint,
  p_comment text default null,
  p_paths text[] default array[]::text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_expected_count integer := coalesce(cardinality(p_paths), 0);
begin
  if auth.uid() is null or v_expected_count not between 1 and 6 then
    raise exception 'Attach between 1 and 6 completion photos';
  end if;

  if not exists (
    select 1 from public.admin_daily_tasks task
    join public.profiles profile on profile.id = task.assigned_to
    where task.id = p_id
      and task.assigned_to = auth.uid()
      and profile.is_active
      and profile.deleted_at is null
      and profile.role in ('cleaner', 'maintenance_staff')
  ) then
    raise exception 'Assigned daily task not found';
  end if;

  foreach v_path in array p_paths loop
    if v_path !~ ('^daily-tasks/' || p_id::text || '/[0-9a-f-]+[.]jpg$') then
      raise exception 'Invalid completion photo path';
    end if;
  end loop;

  if (
    select count(*) from storage.objects object
    where object.bucket_id = 'checkout-evidence' and object.name = any(p_paths)
  ) <> v_expected_count then
    raise exception 'Completion photo upload is incomplete';
  end if;

  update public.admin_daily_tasks
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = p_id and assigned_to = auth.uid();

  insert into public.daily_task_photos(task_id, storage_path, uploaded_by)
  select p_id, path, auth.uid()
  from unnest(p_paths) as path
  on conflict (storage_path) do nothing;

  insert into public.daily_task_activity(task_id, action, comment, actor_id)
  values (p_id, 'Completed', nullif(trim(p_comment), ''), auth.uid());
end
$$;
revoke all on function public.complete_assigned_daily_task(bigint, text, text[]) from public;
grant execute on function public.complete_assigned_daily_task(bigint, text, text[]) to authenticated;

drop policy if exists "cleaners read own submitted reports" on public.complaints;
create policy "cleaners read own submitted reports"
on public.complaints for select to authenticated
using (
  public.is_cleaner()
  and source = 'cleaning'
  and source_reference like ('cleaner:' || (select auth.uid())::text || ':%')
);
