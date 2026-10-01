-- Cleaner reports use a narrowly scoped, authenticated RPC so report creation is
-- independent of direct table INSERT RLS evaluation in server actions.
create or replace function public.create_cleaner_complaint(
  p_block_id smallint,
  p_room_no text,
  p_category text,
  p_description text,
  p_priority text
)
returns table(id uuid, complaint_no text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.';
  end if;

  select p.* into v_actor
  from public.profiles as p
  where p.id = (select auth.uid())
    and p.role = 'cleaner'::public.app_role
    and p.is_active = true
    and p.deleted_at is null;

  if not found then
    raise exception 'Only active Cleaner staff can submit this report.';
  end if;

  if nullif(btrim(p_room_no), '') is null or char_length(p_room_no) > 240 then
    raise exception 'Choose a valid location.';
  end if;
  if nullif(btrim(p_category), '') is null or char_length(p_category) > 220 then
    raise exception 'Choose a valid defect item.';
  end if;
  if char_length(coalesce(p_description, '')) > 3000 then
    raise exception 'Description is too long.';
  end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Choose a valid priority.';
  end if;

  return query
  insert into public.complaints (
    source, source_reference, block_id, room_no,
    complainant_name, reporter_name, category, description, priority
  )
  values (
    'cleaning'::public.complaint_source,
    'cleaner:' || (select auth.uid())::text || ':' || gen_random_uuid()::text,
    p_block_id, btrim(p_room_no), v_actor.full_name, v_actor.full_name,
    btrim(p_category), coalesce(p_description, ''), p_priority::public.complaint_priority
  )
  returning complaints.id, complaints.complaint_no;
end;
$$;

revoke all on function public.create_cleaner_complaint(smallint, text, text, text, text) from public;
grant execute on function public.create_cleaner_complaint(smallint, text, text, text, text) to authenticated;
