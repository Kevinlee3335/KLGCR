-- Final demo: student availability, room access and appointment workflow.
alter table public.complaints
  add column if not exists preferred_date date,
  add column if not exists preferred_time time,
  add column if not exists need_appointment boolean not null default false;

-- Keep the Google Form-era availability columns readable while using explicit
-- workflow names for all new writes.
update public.complaints set
  preferred_date = coalesce(preferred_date, availability_date),
  preferred_time = coalesce(preferred_time, case when availability_time ~* '^\s*([0-9]{1,2}:[0-9]{2})(:[0-9]{2})?\s*(am|pm)?\s*$' then availability_time::time end),
  need_appointment = need_appointment or coalesce(room_access_permission ~* '^\s*(yes|true|1)\s*$',false)
where preferred_date is null or preferred_time is null;

-- Older webhook submissions temporarily stored the Google Form YES/NO answer in
-- this field. Preserve its meaning above, then leave access for admin review.
update public.complaints set room_access_permission=null
where room_access_permission is not null and room_access_permission not in
('resident_present','enter_with_permission','call_before_entering','key_at_office','need_appointment','no_access');

alter table public.complaints drop constraint if exists complaints_room_access_permission_check;
alter table public.complaints add constraint complaints_room_access_permission_check check (
  room_access_permission is null or room_access_permission in
  ('resident_present','enter_with_permission','call_before_entering','key_at_office','need_appointment','no_access')
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  job_id uuid references public.maintenance_jobs(id) on delete set null,
  appointment_date date not null,
  appointment_time time not null,
  assigned_staff uuid not null references public.profiles(id) on delete restrict,
  remarks text,
  status text not null default 'pending_confirmation' check (status in
    ('pending_confirmation','confirmed','completed','cancelled','rescheduled','no_show')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_schedule_idx on public.appointments(appointment_date,appointment_time,status);
create index appointments_staff_idx on public.appointments(assigned_staff,appointment_date);
create trigger appointments_updated_at before update on public.appointments for each row execute function public.set_updated_at();
alter table public.appointments enable row level security;
create policy "management reads appointments" on public.appointments for select to authenticated using (public.is_management());
create policy "staff reads assigned appointments" on public.appointments for select to authenticated using (
  public.current_role()='maintenance_staff' and assigned_staff=auth.uid()
);
create policy "admins create appointments" on public.appointments for insert to authenticated with check (public.is_admin() and created_by=auth.uid());
create policy "admins update appointments" on public.appointments for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select,insert,update on public.appointments to authenticated;

-- An appointment is itself a schedule: mirror its date to the assigned job so
-- it automatically participates in the existing Daily Task workflow.
create function public.sync_appointment_job_schedule() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.job_id is not null and new.status not in ('cancelled','no_show') then
    update public.maintenance_jobs set scheduled_for=new.appointment_date,work_state='appointment',updated_at=now() where id=new.job_id;
  end if;
  return new;
end $$;
create trigger sync_appointment_job_schedule after insert or update of appointment_date,status,job_id on public.appointments
for each row execute function public.sync_appointment_job_schedule();
