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
  if auth.uid() is null or v_expected_count not between 1 and 20 then
    raise exception 'Attach between 1 and 20 completion photos';
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
