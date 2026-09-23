create or replace function public.create_complaint_notification_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_notifications (recipient_id, type, title, body, href, entity_id)
  select p.id,
         'complaint_created',
         'New maintenance complaint',
         'Room ' || new.room_no || ': ' || left(new.description, 110),
         '/admin/complaints/' || new.id::text,
         new.id
  from public.profiles p
  where p.role = 'admin'
    and p.is_active = true
    and p.deleted_at is null;
  return new;
end;
$$;

revoke all on function public.create_complaint_notification_records() from public;

drop trigger if exists create_complaint_notification_records on public.complaints;
create trigger create_complaint_notification_records
after insert on public.complaints
for each row execute function public.create_complaint_notification_records();