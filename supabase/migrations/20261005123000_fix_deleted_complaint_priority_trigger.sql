-- Keep the archived priority column consistent with complaints.priority.
-- The previous trigger converted the enum to text, while production uses
-- complaint_priority on deleted_complaints, which prevented every deletion.
alter table public.deleted_complaints
  alter column priority type public.complaint_priority
  using priority::public.complaint_priority;

create or replace function public.archive_deleted_complaint()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.deleted_complaints(
    id, complaint_no, block_id, room_no, category, description,
    priority, submitted_at, deleted_by
  )
  values (
    old.id, old.complaint_no, old.block_id, old.room_no, old.category,
    old.description, old.priority, old.submitted_at, auth.uid()
  );
  return old;
end;
$$;
