-- Appointment Workflow V4: persist and enforce the three Google Form answers.
-- Preferred availability is reference information; access permission alone
-- decides whether an administrator must create an appointment.
alter table public.complaints
  add column if not exists preferred_date date,
  add column if not exists preferred_time time,
  add column if not exists room_access_permission text,
  add column if not exists appointment_required boolean not null default true;

-- Repair submissions created by the older webhook, which only populated the
-- original availability columns.
update public.complaints
set preferred_date = coalesce(preferred_date, availability_date),
    preferred_time = coalesce(
      preferred_time,
      case
        when availability_time ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
          then availability_time::time
        else null
      end
    )
where source = 'google_form'
  and (preferred_date is null or preferred_time is null);

alter table public.complaints drop constraint if exists complaints_room_access_permission_check;
alter table public.complaints add constraint complaints_room_access_permission_check
  check (room_access_permission is null or room_access_permission in ('yes', 'no'));

create or replace function public.apply_appointment_workflow_v4()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.room_access_permission is not null then
    new.room_access_permission := lower(trim(new.room_access_permission));
    if new.room_access_permission not in ('yes', 'no') then
      raise exception 'Room access permission must be YES or NO';
    end if;
    new.appointment_required := new.room_access_permission = 'no';
    new.need_appointment := new.appointment_required;
  end if;
  return new;
end $$;

drop trigger if exists apply_appointment_workflow_v2 on public.complaints;
drop trigger if exists apply_appointment_workflow_v4 on public.complaints;
create trigger apply_appointment_workflow_v4
before insert or update of room_access_permission on public.complaints
for each row execute function public.apply_appointment_workflow_v4();
