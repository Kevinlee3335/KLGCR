-- Transfer an active cleaning room without resetting progress, photos or audit history.
-- Admin-only, atomic and protected against stale concurrent assignments.
create or replace function public.transfer_checkout_cleaner_task(
  p_room_id uuid,
  p_cleaner uuid,
  p_expected_cleaner uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_room public.checkout_rooms%rowtype;
  v_target public.profiles%rowtype;
  v_previous_name text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can transfer check-out cleaner tasks.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 3
     or length(coalesce(p_reason, '')) > 2000 then
    raise exception 'Enter a transfer reason between 3 and 2000 characters.';
  end if;

  select * into v_room
  from public.checkout_rooms
  where id = p_room_id and deleted_at is null
  for update;

  if not found or v_room.status <> 'cleaning' or v_room.cleaner_id is null then
    raise exception 'Only an assigned room awaiting cleaning can be transferred.';
  end if;

  if v_room.cleaner_id is distinct from p_expected_cleaner then
    raise exception 'The cleaner has changed. Refresh before transferring.';
  end if;

  if v_room.cleaner_id = p_cleaner then
    raise exception 'Choose a different cleaner.';
  end if;

  select * into v_target
  from public.profiles
  where id = p_cleaner and role = 'cleaner'
    and is_active = true and deleted_at is null;

  if not found then
    raise exception 'Choose an active cleaner.';
  end if;

  select full_name into v_previous_name
  from public.profiles where id = v_room.cleaner_id;

  update public.checkout_rooms
  set cleaner_id = p_cleaner
  where id = p_room_id;

  insert into public.checkout_history(
    checkout_room_id, actor_id, action, notes, from_status, to_status
  ) values (
    p_room_id, auth.uid(), 'cleaner_task_transferred',
    coalesce(v_previous_name, v_room.cleaner_id::text)
      || ' → ' || v_target.full_name || '. Reason: ' || trim(p_reason),
    v_room.status, v_room.status
  );

  return jsonb_build_object(
    'reference_no', v_room.reference_no,
    'room_no', v_room.room_no,
    'previous_cleaner', v_previous_name,
    'new_cleaner', v_target.full_name
  );
end;
$$;

revoke all on function public.transfer_checkout_cleaner_task(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.transfer_checkout_cleaner_task(uuid, uuid, uuid, text) to authenticated;
