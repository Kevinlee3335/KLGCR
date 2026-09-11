-- Forward-only production repair: final optional/required appointment architecture.
-- This migration is intentionally self-contained because production may not have
-- the historical appointments table.
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null,
  job_id uuid not null,
  appointment_date date not null,
  appointment_time time not null,
  assigned_staff uuid not null,
  remarks text,
  status text not null default 'pending_confirmation',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Repair columns for any partially-created production table.
alter table public.appointments
  add column if not exists complaint_id uuid,
  add column if not exists job_id uuid,
  add column if not exists appointment_date date,
  add column if not exists appointment_time time,
  add column if not exists assigned_staff uuid,
  add column if not exists remarks text,
  add column if not exists status text not null default 'pending_confirmation',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check check (status in
  ('pending_confirmation','confirmed','completed','cancelled','rescheduled','no_show'));

-- Use stable FK names relied on by PostgREST relationship hints.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='appointment_complaint_id_fkey') then
    alter table public.appointments add constraint appointment_complaint_id_fkey foreign key (complaint_id) references public.complaints(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='appointments_job_id_fkey') then
    alter table public.appointments add constraint appointments_job_id_fkey foreign key (job_id) references public.maintenance_jobs(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='appointments_assigned_staff_fkey') then
    alter table public.appointments add constraint appointments_assigned_staff_fkey foreign key (assigned_staff) references public.profiles(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='appointments_created_by_fkey') then
    alter table public.appointments add constraint appointments_created_by_fkey foreign key (created_by) references public.profiles(id) on delete restrict;
  end if;
end $$;

create index if not exists appointments_schedule_idx on public.appointments(appointment_date,appointment_time,status);
create index if not exists appointments_staff_idx on public.appointments(assigned_staff,appointment_date);
create index if not exists appointments_complaint_idx on public.appointments(complaint_id,created_at desc);
create index if not exists appointments_job_idx on public.appointments(job_id,created_at desc);
-- A job can have history, but only one currently actionable appointment.
create unique index if not exists appointments_one_active_per_job_idx on public.appointments(job_id)
  where status not in ('cancelled','no_show','completed');

alter table public.appointments enable row level security;
drop policy if exists "management reads appointments" on public.appointments;
drop policy if exists "staff reads assigned appointments" on public.appointments;
drop policy if exists "admins create appointments" on public.appointments;
drop policy if exists "admins update appointments" on public.appointments;
create policy "management reads appointments" on public.appointments for select to authenticated using (public.is_management());
create policy "staff reads assigned appointments" on public.appointments for select to authenticated using (
  public.current_role()='maintenance_staff' and assigned_staff=auth.uid() and exists (
    select 1 from public.maintenance_jobs j join public.profile_blocks pb on pb.block_id=j.block_id
    where j.id=appointments.job_id and j.assigned_to=auth.uid() and pb.profile_id=auth.uid()
  )
);
create policy "admins create appointments" on public.appointments for insert to authenticated
  with check (public.is_admin() and created_by=auth.uid());
create policy "admins update appointments" on public.appointments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select,insert,update on public.appointments to authenticated;

-- Remove the obsolete rule that rejected access-granted appointments.
drop trigger if exists enforce_appointment_required on public.appointments;
drop function if exists public.enforce_appointment_required();

-- Validate that manually-added/rescheduled appointments match their job.
create or replace function public.validate_appointment_job()
returns trigger language plpgsql set search_path='' as $$
declare v_job public.maintenance_jobs;
begin
  select * into v_job from public.maintenance_jobs where id=new.job_id;
  if not found or v_job.complaint_id<>new.complaint_id then raise exception 'Appointment must belong to its maintenance job'; end if;
  if v_job.assigned_to<>new.assigned_staff then raise exception 'Appointment staff must be the assigned job staff'; end if;
  return new;
end $$;
drop trigger if exists validate_appointment_job on public.appointments;
create trigger validate_appointment_job before insert or update of complaint_id,job_id,assigned_staff on public.appointments
for each row execute function public.validate_appointment_job();

drop trigger if exists appointments_updated_at on public.appointments;
create trigger appointments_updated_at before update on public.appointments for each row execute function public.set_updated_at();

create or replace function public.sync_appointment_job_schedule()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status not in ('cancelled','no_show','completed') then
    update public.maintenance_jobs set scheduled_for=new.appointment_date,work_state='appointment',updated_at=now() where id=new.job_id;
  elsif not exists (select 1 from public.appointments a where a.job_id=new.job_id and a.id<>new.id and a.status not in ('cancelled','no_show','completed')) then
    update public.maintenance_jobs set scheduled_for=null,work_state='standard',updated_at=now() where id=new.job_id;
  end if;
  return new;
end $$;
drop trigger if exists sync_appointment_job_schedule on public.appointments;
create trigger sync_appointment_job_schedule after insert or update of appointment_date,status,job_id on public.appointments
for each row execute function public.sync_appointment_job_schedule();

-- Creates the assignment, job, and optional appointment in one transaction.
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
  if v_access not in ('yes','no') then raise exception 'Room access permission must be YES or NO'; end if;
  if (p_appointment_date is null)<>(p_appointment_time is null) then
    raise exception 'Maintenance Date and Maintenance Time must either both be provided or both be blank';
  end if;
  if v_access='no' and p_appointment_date is null then
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
-- public.assign_complaint(uuid,uuid) intentionally remains available during rollout.
