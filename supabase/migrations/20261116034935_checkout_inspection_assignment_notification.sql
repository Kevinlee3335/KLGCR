create schema if not exists checkout_private;

create function checkout_private.notify_checkout_inspection_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can assign checkout repairs from inspection.';
  end if;

  insert into public.app_notifications (recipient_id, type, title, body, href, entity_id)
  select assignee.id, 'checkout_assigned', 'New check-out room for rectification',
    pg_catalog.format('%s · Block %s · Room %s was assigned to you after inspection.',
      new.reference_no, block.code, new.room_no),
    '/staff/checkouts/' || new.id::text, new.id
  from public.profiles assignee
  join public.blocks block on block.id = new.block_id
  where assignee.id = new.assigned_to and assignee.role = 'maintenance_staff'
    and assignee.is_active and assignee.deleted_at is null;

  if not found then
    raise exception 'Unable to notify the assigned maintenance staff member.';
  end if;
  return new;
end;
$$;

revoke all on function checkout_private.notify_checkout_inspection_assignment() from public, anon, authenticated;

-- The inspection form writes inspection_notes even when it is blank. Bulk and transfer
-- actions do not write this column and already publish their own notifications.
create trigger checkout_inspection_assignment_notification
after update of inspection_notes on public.checkout_rooms
for each row
when (old.status = 'second_inspection' and new.status = 'rectification'
  and new.assigned_to is not null and new.deleted_at is null)
execute function checkout_private.notify_checkout_inspection_assignment();
