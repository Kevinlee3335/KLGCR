-- Deploy V3 independently because 202609090001 may already be recorded on live systems.
-- Preserve values received through either the legacy availability columns or the
-- explicit preferred fields used by the current Google Form integration.
update public.complaints
set preferred_date = coalesce(preferred_date, availability_date),
    preferred_time = coalesce(
      preferred_time,
      case when availability_time ~* '^\s*([0-9]{1,2}:[0-9]{2})(:[0-9]{2})?\s*(am|pm)?\s*$'
        then availability_time::time end
    )
where preferred_date is null or preferred_time is null;

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
    if new.room_access_permission not in ('yes', 'no') then
      raise exception 'Room access permission must be YES or NO';
    end if;
    new.appointment_required := new.room_access_permission = 'no';
    new.need_appointment := new.appointment_required;
  end if;
  return new;
end $$;
