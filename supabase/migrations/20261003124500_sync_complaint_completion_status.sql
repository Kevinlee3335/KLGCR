-- Keep the cleaner-facing complaint status in sync with the linked maintenance work.
-- A complaint can have multiple maintenance jobs, so it is closed only when all of
-- its jobs are completed.
create or replace function public.sync_complaint_completion_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.complaint_id is null
    or new.status <> 'completed'
    or old.status is not distinct from 'completed' then
    return new;
  end if;

  -- Serialize concurrent job completions for the same complaint. The second
  -- completion sees the first committed job before deciding whether to close it.
  perform 1
  from public.complaints
  where id = new.complaint_id
  for update;

  if found and not exists (
    select 1
    from public.maintenance_jobs as job
    where job.complaint_id = new.complaint_id
      and job.status <> 'completed'
  ) then
    update public.complaints
    set status = 'closed',
        updated_at = now()
    where id = new.complaint_id
      and status = 'assigned';
  end if;

  return new;
end;
$$;

drop trigger if exists maintenance_job_sync_complaint_completion on public.maintenance_jobs;

create trigger maintenance_job_sync_complaint_completion
after update of status on public.maintenance_jobs
for each row
execute function public.sync_complaint_completion_status();

revoke all on function public.sync_complaint_completion_status() from public;
