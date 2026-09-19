-- Cleaner may report newly discovered defects while carrying out a check-out room cleaning handover.
-- Those reports remain visible to Admin in the room's defect register.

alter table public.checkout_defects
  drop constraint if exists checkout_defects_source_check;

alter table public.checkout_defects
  add constraint checkout_defects_source_check
  check (source in ('utmspace', 'second_inspection', 'cleaner'));

create policy "cleaners add checkout defects during cleaning"
on public.checkout_defects
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and source = 'cleaner'
  and exists (
    select 1
    from public.checkout_rooms room
    where room.id = checkout_room_id
      and room.cleaner_id = (select auth.uid())
      and room.status = 'cleaning'
  )
);
