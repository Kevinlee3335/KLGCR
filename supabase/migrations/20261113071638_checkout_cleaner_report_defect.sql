alter table public.checkout_defects
  drop constraint if exists checkout_defects_source_check,
  add constraint checkout_defects_source_check
    check (source in ('utmspace', 'second_inspection', 'cleaner'));

create schema if not exists checkout_private;
revoke all on schema checkout_private from public, anon;
grant usage on schema checkout_private to authenticated;

-- The cleaner loses the active assignment when the room returns to the maintenance queue.
-- Keep the privileged operation outside the Data API schema and authorize the caller here.
create function checkout_private.report_cleaning_defects(p_room uuid, p_descriptions text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporter uuid := auth.uid();
  room public.checkout_rooms;
  defect_count integer;
begin
  if not exists (
    select 1 from public.profiles
    where id = reporter and role = 'cleaner' and is_active and deleted_at is null
  ) then
    raise exception 'Not authorized to report cleaning defects.';
  end if;

  if coalesce(cardinality(p_descriptions), 0) not between 1 and 20 or exists (
    select 1
    from unnest(p_descriptions) as defect(description)
    where description is null or char_length(btrim(description)) not between 1 and 2000
      or description ~* '^[[:space:]]*(no defects?[.!]?)?[[:space:]]*$'
  ) then
    raise exception 'Select 1 to 20 valid defects to report.';
  end if;

  -- Use the same room lock as Complete Cleaning to serialize both choices.
  select * into room
  from public.checkout_rooms
  where id = p_room and cleaner_id = reporter and status = 'cleaning' and deleted_at is null
  for update;
  if not found then
    raise exception 'This room is no longer assigned to you for cleaning.';
  end if;

  insert into public.checkout_defects (checkout_room_id, description, source, created_by)
  select room.id, defect.description, 'cleaner', reporter
  from (select distinct btrim(description) as description from unnest(p_descriptions) as item(description)) as defect;
  get diagnostics defect_count = row_count;

  update public.checkout_rooms
  set status = 'second_inspection', assigned_to = null, cleaner_id = null, ready_at = null
  where id = room.id;

  insert into public.checkout_history (checkout_room_id, actor_id, action, notes, from_status, to_status)
  values (room.id, reporter, 'cleaner_defects_reported',
    format('%s new defect(s) reported during cleaning. Awaiting maintenance assignment.', defect_count),
    'cleaning', 'second_inspection');

  return jsonb_build_object('reference_no', room.reference_no, 'room_no', room.room_no);
end;
$$;

revoke all on function checkout_private.report_cleaning_defects(uuid, text[]) from public, anon;
grant execute on function checkout_private.report_cleaning_defects(uuid, text[]) to authenticated;

create function public.report_checkout_cleaning_defects(p_room uuid, p_descriptions text[])
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select checkout_private.report_cleaning_defects(p_room, p_descriptions);
$$;

revoke all on function public.report_checkout_cleaning_defects(uuid, text[]) from public, anon;
grant execute on function public.report_checkout_cleaning_defects(uuid, text[]) to authenticated;
