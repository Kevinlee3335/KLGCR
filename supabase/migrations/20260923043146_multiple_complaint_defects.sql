-- One submitted complaint can produce up to ten separately tracked maintenance jobs.
-- Keep the original complaint and its Google Form response intact.
alter table public.maintenance_jobs drop constraint if exists maintenance_jobs_complaint_id_key;
create index if not exists maintenance_jobs_complaint_id_idx on public.maintenance_jobs(complaint_id);

create or replace function public.assign_complaint_defects(
  p_complaint_id uuid, p_assigned_to uuid, p_defects jsonb,
  p_appointment_date date default null, p_appointment_time time default null,
  p_remarks text default null
) returns table(job_id uuid, job_no text)
language plpgsql security invoker set search_path = '' as $$
declare
  v_complaint public.complaints;
  v_defect jsonb;
  v_area text;
  v_item text;
  v_issue text;
  v_note text;
  v_description text;
  v_category text;
  v_count integer;
  v_job_id uuid;
  v_job_no text;
  v_seen text[] := array[]::text[];
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into v_complaint from public.complaints where id = p_complaint_id for update;
  if not found then raise exception 'Complaint not found'; end if;
  if v_complaint.status in ('rejected','closed') then raise exception 'Complaint cannot be assigned'; end if;

  if p_defects is null or jsonb_typeof(p_defects) <> 'array' then
    raise exception 'Select at least one confirmed defect';
  end if;
  v_count := jsonb_array_length(p_defects);
  if v_count < 1 or v_count > 10 then raise exception 'Select 1 to 10 defects'; end if;
  if (select count(*) from public.maintenance_jobs where complaint_id = p_complaint_id) + v_count > 10 then
    raise exception 'A complaint can have at most 10 maintenance defects';
  end if;

  if (p_appointment_date is null) <> (p_appointment_time is null) then
    raise exception 'Maintenance Date and Maintenance Time must either both be provided or both be blank';
  end if;
  if v_complaint.source = 'google_form' then
    if lower(trim(coalesce(v_complaint.room_access_permission,''))) not in ('yes','no') then
      raise exception 'Room access permission must be YES or NO';
    end if;
    if lower(trim(v_complaint.room_access_permission)) = 'no' and p_appointment_date is null then
      raise exception 'Maintenance Date and Maintenance Time are required when room access is NO';
    end if;
  end if;
  if not exists (
    select 1 from public.profiles p join public.profile_blocks pb on pb.profile_id = p.id
    where p.id = p_assigned_to and p.role = 'maintenance_staff' and p.is_active
      and p.deleted_at is null and pb.block_id = v_complaint.block_id
  ) then raise exception 'Staff member is not active or allowed for this block'; end if;

  for v_defect in select value from jsonb_array_elements(p_defects)
  loop
    if jsonb_typeof(v_defect) <> 'object' then raise exception 'Invalid defect'; end if;
    v_area := trim(coalesce(v_defect->>'area',''));
    v_item := trim(coalesce(v_defect->>'item',''));
    v_issue := trim(coalesce(v_defect->>'issue',''));
    v_note := trim(coalesce(v_defect->>'note',''));
    if v_area not in ('Room','Bathroom','Common Area') or
       length(v_item) not between 1 and 100 or
       length(v_issue) not between 1 and 100 or length(v_note) > 500 then
      raise exception 'Invalid confirmed defect';
    end if;
    v_description := v_area || ' — ' || v_item || ' — ' || v_issue ||
      case when v_note <> '' then ' (' || v_note || ')' else '' end;
    if v_description = any(v_seen) or exists (
      select 1 from public.maintenance_jobs
      where complaint_id = p_complaint_id and description = v_description
    ) then raise exception 'Duplicate defect: %', v_description; end if;
    v_seen := array_append(v_seen, v_description);
    v_category := case
      when v_area = 'Bathroom' then
        case when v_item in ('Water Tap / Sink Tap','Shower Valve','Flexible Hose') then 'Plumbing' else 'Bathroom' end
      when v_item = 'Air Conditioning' then 'Air Conditioning'
      when v_item in ('Lighting','Ceiling Fan') then 'Electrical'
      when v_area = 'Common Area' then 'Common Area'
      else 'Room Maintenance'
    end;
    insert into public.maintenance_jobs(complaint_id,block_id,room_no,category,description,priority,assigned_to)
    values(v_complaint.id,v_complaint.block_id,v_complaint.room_no,v_category,v_description,v_complaint.priority,p_assigned_to)
    returning id,maintenance_jobs.job_no into v_job_id,v_job_no;
    if p_appointment_date is not null then
      insert into public.appointments(complaint_id,job_id,appointment_date,appointment_time,assigned_staff,remarks,created_by)
      values(v_complaint.id,v_job_id,p_appointment_date,p_appointment_time,p_assigned_to,nullif(trim(p_remarks),''),auth.uid());
    end if;
    job_id := v_job_id;
    job_no := v_job_no;
    return next;
  end loop;
  update public.complaints set status='assigned',assigned_to=p_assigned_to,
    assigned_at=coalesce(assigned_at,now()),reviewed_by=auth.uid(),reviewed_at=now()
    where id=p_complaint_id;
end $$;
revoke all on function public.assign_complaint_defects(uuid,uuid,jsonb,date,time,text) from public;
grant execute on function public.assign_complaint_defects(uuid,uuid,jsonb,date,time,text) to authenticated;
