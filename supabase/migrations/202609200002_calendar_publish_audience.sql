-- Separate the event subject (for example, who is on leave) from event visibility.
alter table public.calendar_events
  add column if not exists subject_staff_id uuid references public.profiles(id) on delete set null;

create index if not exists calendar_events_subject_staff_idx on public.calendar_events(subject_staff_id);

drop policy if exists "calendar visible to recipients, team leave and management" on public.calendar_events;
create policy "calendar visible to recipients and management"
on public.calendar_events for select to authenticated
using (
  audience = 'all_staff'
  or assigned_to = (select auth.uid())
  or public.is_management()
);
