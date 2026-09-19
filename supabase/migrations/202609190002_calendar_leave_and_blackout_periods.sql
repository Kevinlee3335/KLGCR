-- Show staff leave and company no-leave periods to every signed-in employee.
alter table public.calendar_events
  add column event_type text not null default 'work'
  check (event_type in ('work', 'leave', 'no_leave'));

drop policy if exists "calendar visible to recipient and management" on public.calendar_events;
create policy "calendar visible to recipients, team leave and management"
on public.calendar_events
for select to authenticated
using (
  audience = 'all_staff'
  or event_type in ('leave', 'no_leave')
  or assigned_to = (select auth.uid())
  or (select public.is_management())
);