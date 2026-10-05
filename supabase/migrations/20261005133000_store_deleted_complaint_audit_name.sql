alter table public.deleted_complaints
  add column if not exists deleted_by_name text;

update public.deleted_complaints archived
set deleted_by_name = profiles.full_name
from public.profiles
where archived.deleted_by = profiles.id
  and archived.deleted_by_name is null;

create or replace function public.archive_deleted_complaint()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.deleted_complaints(
    id, complaint_no, block_id, room_no, category, description,
    priority, submitted_at, deleted_by, deleted_by_name
  )
  values (
    old.id, old.complaint_no, old.block_id, old.room_no, old.category,
    old.description, old.priority, old.submitted_at, auth.uid(),
    (select full_name from public.profiles where id = auth.uid())
  );
  return old;
end;
$$;
