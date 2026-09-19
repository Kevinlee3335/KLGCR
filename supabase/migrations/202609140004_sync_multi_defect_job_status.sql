-- Step 2: for multi-defect jobs, derive the overall job status from each Defect.
create or replace function public.sync_job_status_from_complaint_defects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_complaint uuid;
  v_total integer;
  v_completed integer;
  v_pending integer;
  v_monitoring integer;
  v_job uuid;
begin
  v_complaint = coalesce(new.complaint_id, old.complaint_id);

  select count(*),
         count(*) filter (where status = 'completed'),
         count(*) filter (where status = 'pending_material'),
         count(*) filter (where status = 'under_monitoring')
    into v_total, v_completed, v_pending, v_monitoring
  from public.complaint_defects
  where complaint_id = v_complaint;

  select id into v_job
  from public.maintenance_jobs
  where complaint_id = v_complaint;

  if v_job is null or v_total <= 1 then
    return coalesce(new, old);
  end if;

  update public.maintenance_jobs
  set status = case
        when v_completed = v_total then 'completed'
        when v_pending > 0 then 'pending_material'
        when v_monitoring > 0 then 'under_monitoring'
        else 'in_progress'
      end,
      completed_at = case when v_completed = v_total then coalesce(completed_at, now()) else null end
  where id = v_job;

  return coalesce(new, old);
end;
$$;

drop trigger if exists complaint_defects_sync_job_status on public.complaint_defects;
create trigger complaint_defects_sync_job_status
after insert or update of status on public.complaint_defects
for each row execute function public.sync_job_status_from_complaint_defects();

-- Allow the assigned Maintenance staff member to update only a Defect on their own job.
create or replace function public.update_assigned_complaint_defect(
  p_defect_id uuid,
  p_status public.complaint_defect_status,
  p_completion_note text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('in_progress', 'under_monitoring', 'pending_material', 'completed') then
    raise exception 'Invalid defect progress status';
  end if;

  if not exists (
    select 1
    from public.complaint_defects d
    join public.complaints c on c.id = d.complaint_id
    where d.id = p_defect_id
      and c.assigned_to = auth.uid()
  ) then
    raise exception 'You are not assigned to this defect';
  end if;

  update public.complaint_defects
  set status = p_status,
      completion_note = nullif(trim(p_completion_note), ''),
      completed_by = case when p_status = 'completed' then auth.uid() else null end,
      completed_at = case when p_status = 'completed' then now() else null end
  where id = p_defect_id;
end;
$$;

revoke all on function public.update_assigned_complaint_defect(uuid, public.complaint_defect_status, text) from public;
grant execute on function public.update_assigned_complaint_defect(uuid, public.complaint_defect_status, text) to authenticated;
