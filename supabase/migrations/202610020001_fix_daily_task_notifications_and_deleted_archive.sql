-- Make deletion history reliable for existing deployments.  The original
-- trigger ran with the deleting user's table permissions, which can fail even
-- when an administrator is allowed to delete the complaint.
grant select, insert on table public.deleted_complaints to authenticated;

create or replace function public.archive_deleted_complaint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  insert into public.deleted_complaints
    (id, complaint_no, block_id, room_no, category, description, priority, submitted_at, deleted_by)
  values
    (old.id, old.complaint_no, old.block_id, old.room_no, old.category, old.description,
     old.priority::text, old.submitted_at, auth.uid());
  return old;
end;
$$;

revoke all on function public.archive_deleted_complaint() from public;
