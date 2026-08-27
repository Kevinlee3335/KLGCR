-- KLGCR V1 Phase 3: safe staff completion, monitoring and pending-material workflow.
alter table public.maintenance_jobs
  add column action_taken text,
  add column monitoring_note text,
  add column monitoring_started_at timestamptz,
  add column monitoring_review_at timestamptz,
  add column pending_material_note text;

create table public.job_status_history (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.maintenance_jobs(id) on delete restrict,
  previous_status public.job_status not null,
  new_status public.job_status not null,
  note text,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index job_status_history_job_idx on public.job_status_history(job_id, created_at desc);
alter table public.job_status_history enable row level security;
create policy "management reads all job history; staff reads own job history" on public.job_status_history
  for select to authenticated using (
    public.is_management() or exists (
      select 1 from public.maintenance_jobs j
      join public.profile_blocks pb on pb.profile_id = auth.uid() and pb.block_id = j.block_id
      where j.id = job_status_history.job_id and j.assigned_to = auth.uid()
    )
  );
revoke insert, update, delete on public.job_status_history from authenticated;
grant select on public.job_status_history to authenticated;

-- Replace Phase 2 start RPC so starts are included in the immutable timeline.
create or replace function public.start_assigned_job(p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_previous public.job_status;
begin
  if public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  select j.status into v_previous from public.maintenance_jobs j
  where j.id=p_job_id and j.assigned_to=auth.uid() and j.status='assigned'
    and exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id)
  for update;
  if not found then raise exception 'Assigned job not found or cannot be started'; end if;
  update public.maintenance_jobs set status='in_progress',started_at=coalesce(started_at,now()) where id=p_job_id;
  insert into public.job_status_history(job_id,previous_status,new_status,changed_by)
  values(p_job_id,v_previous,'in_progress',auth.uid());
end $$;

create function public.complete_assigned_job(p_job_id uuid, p_action_taken text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_previous public.job_status;
begin
  if public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  if nullif(trim(p_action_taken),'') is null then raise exception 'Action taken is required'; end if;
  select j.status into v_previous from public.maintenance_jobs j
  where j.id=p_job_id and j.assigned_to=auth.uid() and j.status in ('in_progress','under_monitoring','pending_material')
    and exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id)
  for update;
  if not found then raise exception 'Job not found or cannot be completed'; end if;
  update public.maintenance_jobs set status='completed',action_taken=trim(p_action_taken),completed_at=now() where id=p_job_id;
  insert into public.job_status_history(job_id,previous_status,new_status,note,changed_by)
  values(p_job_id,v_previous,'completed',trim(p_action_taken),auth.uid());
end $$;

create function public.monitor_assigned_job(p_job_id uuid, p_note text, p_review_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_previous public.job_status;
begin
  if public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  if nullif(trim(p_note),'') is null then raise exception 'Monitoring note is required'; end if;
  select j.status into v_previous from public.maintenance_jobs j
  where j.id=p_job_id and j.assigned_to=auth.uid() and j.status in ('in_progress','under_monitoring')
    and exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id)
  for update;
  if not found then raise exception 'Job not found or cannot be monitored'; end if;
  update public.maintenance_jobs set status='under_monitoring',monitoring_note=trim(p_note),
    monitoring_started_at=coalesce(monitoring_started_at,now()),monitoring_review_at=p_review_at where id=p_job_id;
  insert into public.job_status_history(job_id,previous_status,new_status,note,changed_by)
  values(p_job_id,v_previous,'under_monitoring',trim(p_note),auth.uid());
end $$;

create function public.set_job_pending_material(p_job_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_previous public.job_status;
begin
  if public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  if nullif(trim(p_note),'') is null then raise exception 'Material note is required'; end if;
  select j.status into v_previous from public.maintenance_jobs j
  where j.id=p_job_id and j.assigned_to=auth.uid() and j.status='in_progress'
    and exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id)
  for update;
  if not found then raise exception 'Job not found or cannot be set pending material'; end if;
  update public.maintenance_jobs set status='pending_material',pending_material_note=trim(p_note) where id=p_job_id;
  insert into public.job_status_history(job_id,previous_status,new_status,note,changed_by)
  values(p_job_id,v_previous,'pending_material',trim(p_note),auth.uid());
end $$;

create function public.resume_assigned_job(p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  update public.maintenance_jobs j set status='in_progress'
  where j.id=p_job_id and j.assigned_to=auth.uid() and j.status='pending_material'
    and exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id);
  if not found then raise exception 'Pending job not found or cannot be resumed'; end if;
  insert into public.job_status_history(job_id,previous_status,new_status,changed_by)
  values(p_job_id,'pending_material','in_progress',auth.uid());
end $$;

revoke all on function public.complete_assigned_job(uuid,text) from public;
revoke all on function public.monitor_assigned_job(uuid,text,timestamptz) from public;
revoke all on function public.set_job_pending_material(uuid,text) from public;
revoke all on function public.resume_assigned_job(uuid) from public;
grant execute on function public.complete_assigned_job(uuid,text), public.monitor_assigned_job(uuid,text,timestamptz),
  public.set_job_pending_material(uuid,text), public.resume_assigned_job(uuid) to authenticated;
