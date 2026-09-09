-- Appointment Workflow V3: access permission, not preferred availability,
-- determines whether a separate appointment is required.
alter table public.complaints
  add column if not exists appointment_required boolean not null default true;

alter table public.complaints drop constraint if exists complaints_room_access_permission_check;

update public.complaints
set room_access_permission = case
      when lower(trim(room_access_permission)) in ('yes', 'enter_with_permission', 'key_at_office') then 'yes'
      when lower(trim(room_access_permission)) in ('no', 'resident_present', 'call_before_entering', 'need_appointment', 'no_access') then 'no'
      when room_access_permission is not null then 'no'
      -- The Google Form access request was historically stored in this field.
      when need_appointment then 'yes'
      else 'no'
    end;

update public.complaints
set appointment_required = room_access_permission = 'no',
    need_appointment = room_access_permission = 'no';

-- Incorrect V1 appointments for access-granted rooms become ordinary,
-- unscheduled maintenance jobs rather than remaining in appointment queues.
delete from public.appointments a
using public.complaints c
where a.complaint_id = c.id and not c.appointment_required;

update public.maintenance_jobs j
set work_state = 'standard', scheduled_for = null
from public.complaints c
where j.complaint_id = c.id
  and not c.appointment_required
  and j.work_state = 'appointment';

alter table public.complaints add constraint complaints_room_access_permission_check
  check (room_access_permission is null or room_access_permission in ('yes', 'no'));

-- V3 accepts the explicit Google Form mapping while retaining compatibility
-- with rows sent by the old webhook contract.
create or replace function public.apply_appointment_workflow_v2()
returns trigger language plpgsql set search_path = '' as $$
declare access_granted boolean;
begin
  if new.source = 'google_form' and new.room_access_permission is null then
    access_granted := new.need_appointment;
    new.room_access_permission := case when access_granted then 'yes' else 'no' end;
    new.appointment_required := not access_granted;
    new.need_appointment := not access_granted;
  elsif new.room_access_permission is not null then
    new.room_access_permission := lower(trim(new.room_access_permission));
    new.appointment_required := new.room_access_permission = 'no';
    new.need_appointment := new.appointment_required;
  end if;
  return new;
end $$;

drop trigger if exists apply_appointment_workflow_v2 on public.complaints;
create trigger apply_appointment_workflow_v2
before insert or update of room_access_permission, need_appointment on public.complaints
for each row execute function public.apply_appointment_workflow_v2();

-- Appointments may only exist for complaints where the tenant must be present.
create or replace function public.enforce_appointment_required()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.complaints
    where id = new.complaint_id and appointment_required
  ) then
    raise exception 'Appointment is not required when room access is granted';
  end if;
  return new;
end $$;

drop trigger if exists enforce_appointment_required on public.appointments;
create trigger enforce_appointment_required
before insert or update of complaint_id on public.appointments
for each row execute function public.enforce_appointment_required();
