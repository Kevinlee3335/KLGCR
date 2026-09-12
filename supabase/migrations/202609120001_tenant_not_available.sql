-- Record appointment attendance without changing job state, and authorize the
-- action by actual job ownership rather than block eligibility.
alter table public.appointments
  add column if not exists attended_at timestamptz,
  add column if not exists no_show_remarks text,
  add column if not exists attended_by uuid references public.profiles(id) on delete restrict;

create index if not exists appointments_attended_by_idx on public.appointments(attended_by, attended_at desc);

create or replace function public.mark_tenant_not_available(p_job_id uuid, p_remarks text default null)
returns table(appointment_id uuid, complaint_id uuid, appointment_date date, appointment_time time, attended_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.profiles p
    join public.maintenance_jobs j on j.assigned_to = p.id
    where p.id = auth.uid() and p.role = 'maintenance_staff' and p.is_active
      and p.deleted_at is null
      and j.id = p_job_id and j.status not in ('completed', 'cancelled')
  ) then
    raise exception 'Job not found or not assigned to you';
  end if;

  select a.* into v_appointment
  from public.appointments a
  where a.job_id = p_job_id
    and a.status in ('pending_confirmation', 'confirmed')
  order by a.created_at desc
  limit 1 for update;

  if v_appointment.id is null then raise exception 'No actionable appointment found'; end if;

  update public.appointments a set
    status = 'no_show', attended_at = v_now, attended_by = auth.uid(),
    no_show_remarks = nullif(trim(p_remarks), '')
  where a.id = v_appointment.id;

  return query select v_appointment.id, v_appointment.complaint_id,
    v_appointment.appointment_date, v_appointment.appointment_time, v_now;
end;
$$;

revoke all on function public.mark_tenant_not_available(uuid,text) from public;
grant execute on function public.mark_tenant_not_available(uuid,text) to authenticated;
