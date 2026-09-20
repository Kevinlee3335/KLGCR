-- Extend the existing KLGCR calendar event types for the Admin total calendar.
-- The calendar_events table already exists in production.
alter table public.calendar_events drop constraint if exists calendar_events_event_type_check;
alter table public.calendar_events add constraint calendar_events_event_type_check
  check (event_type = any (array['work'::text, 'leave'::text, 'no_leave'::text, 'meeting'::text, 'other'::text]));

create index if not exists calendar_events_starts_at_idx on public.calendar_events(starts_at);
create index if not exists calendar_events_assigned_starts_at_idx on public.calendar_events(assigned_to, starts_at);
