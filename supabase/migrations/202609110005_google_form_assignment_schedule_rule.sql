-- Room-access permission controls scheduling only for Google Form complaints.
create or replace function public.assign_complaint_with_schedule(
  p_complaint_id uuid, p_assigned_to uuid, p_appointment_date date default null,
  p_appointment_time time default null, p_remarks text default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_complaint public.complaints; v_job_id uuid; v_access text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into v_complaint from public.complaints where id=p_complaint_id for update;
  if not found then raise exception 'Complaint not found'; end if;
  if v_complaint.status in ('assigned','rejected','closed') then raise exception 'Complaint cannot be assigned'; end if;

  v_access:=lower(trim(coalesce(v_complaint.room_access_permission,'')));
  if v_complaint.source='google_form' and v_access not in ('yes','no') then
    raise exception 'Room access permission must be YES or NO';
  end if;
  if (p_appointment_date is null)<>(p_appointment_time is null) then
    raise exception 'Maintenance Date and Maintenance Time must either both be provided or both be blank';
  end if;
  if v_complaint.source='google_form' and v_access='no' and p_appointment_date is null then
    raise exception 'Maintenance Date and Maintenance Time are required when room access is NO';
  end if;
  if not exists (
    select 1 from public.profiles p join public.profile_blocks pb on pb.profile_id=p.id
    where p.id=p_assigned_to and p.role='maintenance_staff' and p.is_active and p.deleted_at is null and pb.block_id=v_complaint.block_id
  ) then raise exception 'Staff member is not active or allowed for this block'; end if;

  insert into public.maintenance_jobs(complaint_id,block_id,room_no,category,description,priority,assigned_to)
  values(v_complaint.id,v_complaint.block_id,v_complaint.room_no,v_complaint.category,v_complaint.description,v_complaint.priority,p_assigned_to)
  returning id into v_job_id;
  if p_appointment_date is not null then
    insert into public.appointments(complaint_id,job_id,appointment_date,appointment_time,assigned_staff,remarks,created_by)
    values(v_complaint.id,v_job_id,p_appointment_date,p_appointment_time,p_assigned_to,nullif(trim(p_remarks),''),auth.uid());
  end if;
  update public.complaints set status='assigned',assigned_to=p_assigned_to,assigned_at=now(),reviewed_by=auth.uid(),reviewed_at=now()
    where id=p_complaint_id;
  return v_job_id;
end $$;
revoke all on function public.assign_complaint_with_schedule(uuid,uuid,date,time,text) from public;
grant execute on function public.assign_complaint_with_schedule(uuid,uuid,date,time,text) to authenticated;
