-- KLGCR V1: every active Maintenance staff member can read every maintenance
-- report, including external-area jobs. Job updates remain restricted to the
-- maintenance staff member recorded in maintenance_jobs.assigned_to.

drop policy if exists "management reads all jobs; staff reads assigned allowed jobs" on public.maintenance_jobs;
create policy "management reads all jobs; maintenance staff reads all jobs"
on public.maintenance_jobs for select to authenticated
using (public.is_management() or public.current_role() = 'maintenance_staff');

-- Complaint detail is required by the report list and job-detail screens.
-- Keep this SECURITY DEFINER helper to avoid recursive complaints/jobs RLS.
create or replace function public.staff_can_read_job_complaint(p_complaint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_role() = 'maintenance_staff'
    and exists (
      select 1
      from public.maintenance_jobs j
      where j.complaint_id = p_complaint_id
    );
$$;

drop policy if exists "staff reads complaints for assigned allowed jobs" on public.complaints;
drop policy if exists "maintenance staff reads complaints for visible jobs" on public.complaints;
create policy "maintenance staff reads complaints for visible jobs"
on public.complaints for select to authenticated
using (public.staff_can_read_job_complaint(id));

drop policy if exists "management reads all job history; staff reads own job history" on public.job_status_history;
create policy "management reads all job history; maintenance staff reads all job history"
on public.job_status_history for select to authenticated
using (public.is_management() or public.current_role() = 'maintenance_staff');

drop policy if exists "staff reads assigned appointments" on public.appointments;
drop policy if exists "maintenance staff reads all appointments" on public.appointments;
create policy "maintenance staff reads all appointments"
on public.appointments for select to authenticated
using (public.current_role() = 'maintenance_staff');

-- External Area jobs have no block_id. The job was already validly assigned by
-- Admin, so the assignee must be able to carry out its normal workflow.
create or replace function public.start_assigned_job(p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_previous public.job_status;
begin
  if public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  select j.status into v_previous from public.maintenance_jobs j
  where j.id=p_job_id and j.assigned_to=auth.uid() and j.status='assigned'
    and (j.block_id is null or exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id))
  for update;
  if not found then raise exception 'Assigned job not found or cannot be started'; end if;
  update public.maintenance_jobs set status='in_progress',started_at=coalesce(started_at,now()) where id=p_job_id;
  insert into public.job_status_history(job_id,previous_status,new_status,changed_by)
  values(p_job_id,v_previous,'in_progress',auth.uid());
end $$;

create or replace function public.complete_assigned_job(p_job_id uuid, p_action_taken text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_previous public.job_status;
begin
  if public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  if nullif(trim(p_action_taken),'') is null then raise exception 'Action taken is required'; end if;
  select j.status into v_previous from public.maintenance_jobs j
  where j.id=p_job_id and j.assigned_to=auth.uid() and j.status in ('in_progress','under_monitoring','pending_material')
    and (j.block_id is null or exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id))
  for update;
  if not found then raise exception 'Job not found or cannot be completed'; end if;
  update public.maintenance_jobs set status='completed',action_taken=trim(p_action_taken),completed_at=now() where id=p_job_id;
  insert into public.job_status_history(job_id,previous_status,new_status,note,changed_by)
  values(p_job_id,v_previous,'completed',trim(p_action_taken),auth.uid());
end $$;

create or replace function public.monitor_assigned_job(p_job_id uuid, p_note text, p_review_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_previous public.job_status;
begin
  if public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  if nullif(trim(p_note),'') is null then raise exception 'Monitoring note is required'; end if;
  select j.status into v_previous from public.maintenance_jobs j
  where j.id=p_job_id and j.assigned_to=auth.uid() and j.status in ('in_progress','under_monitoring')
    and (j.block_id is null or exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id))
  for update;
  if not found then raise exception 'Job not found or cannot be monitored'; end if;
  update public.maintenance_jobs set status='under_monitoring',monitoring_note=trim(p_note),
    monitoring_started_at=coalesce(monitoring_started_at,now()),monitoring_review_at=p_review_at where id=p_job_id;
  insert into public.job_status_history(job_id,previous_status,new_status,note,changed_by)
  values(p_job_id,v_previous,'under_monitoring',trim(p_note),auth.uid());
end $$;

create or replace function public.set_job_pending_material(p_job_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_previous public.job_status;
begin
  if public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  if nullif(trim(p_note),'') is null then raise exception 'Material note is required'; end if;
  select j.status into v_previous from public.maintenance_jobs j
  where j.id=p_job_id and j.assigned_to=auth.uid() and j.status='in_progress'
    and (j.block_id is null or exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id))
  for update;
  if not found then raise exception 'Job not found or cannot be set pending material'; end if;
  update public.maintenance_jobs set status='pending_material',pending_material_note=trim(p_note) where id=p_job_id;
  insert into public.job_status_history(job_id,previous_status,new_status,note,changed_by)
  values(p_job_id,v_previous,'pending_material',trim(p_note),auth.uid());
end $$;

create or replace function public.resume_assigned_job(p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  update public.maintenance_jobs j set status='in_progress'
  where j.id=p_job_id and j.assigned_to=auth.uid() and j.status='pending_material'
    and (j.block_id is null or exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id));
  if not found then raise exception 'Pending job not found or cannot be resumed'; end if;
  insert into public.job_status_history(job_id,previous_status,new_status,changed_by)
  values(p_job_id,'pending_material','in_progress',auth.uid());
end $$;

-- The latest material-request RPC supports the Other item option. Preserve
-- ownership checks while allowing the assigned staff to request material for
-- an External Area job with no block_id.
create or replace function public.create_material_request(p_job_id uuid,p_note text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request uuid; v_item jsonb; v_item_id uuid; v_other text;
begin
  if auth.uid() is null or public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  if not exists(select 1 from public.maintenance_jobs j where j.id=p_job_id and j.assigned_to=auth.uid()
    and j.status in ('in_progress','pending_material') and (j.block_id is null or exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id)))
    then raise exception 'Job not found or not allowed'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 3 then raise exception 'Select 1 to 3 materials'; end if;
  insert into public.material_requests(job_id,requested_by,note) values(p_job_id,auth.uid(),nullif(trim(p_note),'')) returning id into v_request;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'qty')::numeric,0)<=0 then raise exception 'Invalid quantity'; end if;
    v_item_id:=nullif(v_item->>'inventory_item_id','')::uuid;
    v_other:=nullif(trim(v_item->>'other_item_name'),'');
    if v_item_id is null then
      if v_other is null or length(v_other)>200 then raise exception 'Enter the Other item name'; end if;
    elsif not exists(select 1 from public.inventory_items where id=v_item_id and is_active) then raise exception 'Inventory item not found'; end if;
    insert into public.material_request_items(request_id,inventory_item_id,other_item_name,requested_qty)
      values(v_request,v_item_id,case when v_item_id is null then v_other end,(v_item->>'qty')::numeric);
  end loop;
  if exists(select 1 from public.maintenance_jobs where id=p_job_id and status='in_progress') then
    perform public.set_job_pending_material(p_job_id,coalesce(nullif(trim(p_note),''),'Material requested'));
  end if;
  return v_request;
end $$;
