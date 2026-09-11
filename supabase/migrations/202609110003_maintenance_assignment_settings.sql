-- Atomically replace assignment eligibility for active maintenance staff.
-- This migration changes no profile_blocks data and preserves all job RLS policies.
create or replace function public.replace_maintenance_assignment_blocks(p_assignments jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assignment jsonb;
  v_profile_id uuid;
  v_blocks jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Assignments must be an array';
  end if;

  for v_assignment in select value from jsonb_array_elements(p_assignments)
  loop
    v_profile_id := (v_assignment->>'profileId')::uuid;
    v_blocks := coalesce(v_assignment->'blocks', '[]'::jsonb);
    if not exists (
      select 1 from public.profiles
      where id = v_profile_id and role = 'maintenance_staff' and is_active and deleted_at is null
    ) then raise exception 'Invalid active maintenance staff member'; end if;
    if jsonb_typeof(v_blocks) <> 'array' or exists (
      select 1 from jsonb_array_elements_text(v_blocks) code where code not in ('A','B','C','D')
    ) then raise exception 'Invalid block selection'; end if;

    delete from public.profile_blocks where profile_id = v_profile_id;
    insert into public.profile_blocks(profile_id, block_id)
    select v_profile_id, b.id
    from public.blocks b
    join (select distinct value as code from jsonb_array_elements_text(v_blocks)) selected on selected.code = b.code
    where b.is_active;
  end loop;
end;
$$;

revoke all on function public.replace_maintenance_assignment_blocks(jsonb) from public, anon;
grant execute on function public.replace_maintenance_assignment_blocks(jsonb) to authenticated;
