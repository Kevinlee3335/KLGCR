-- Admin calendar: leave, meetings and other operational events.
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('leave','meeting','other')),
  title text not null check (length(trim(title)) > 0),
  event_date date not null,
  start_time time,
  end_time time,
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or start_time is null or end_time > start_time)
);

create index if not exists calendar_events_date_idx on public.calendar_events(event_date);
create index if not exists calendar_events_assigned_date_idx on public.calendar_events(assigned_to, event_date);

drop trigger if exists calendar_events_updated_at on public.calendar_events;
create trigger calendar_events_updated_at before update on public.calendar_events
for each row execute function public.set_updated_at();

alter table public.calendar_events enable row level security;

create policy "management reads calendar events"
on public.calendar_events for select to authenticated
using (public.is_management() or assigned_to = (select auth.uid()));

create policy "admins create calendar events"
on public.calendar_events for insert to authenticated
with check (public.is_admin() and created_by = (select auth.uid()));

create policy "admins update calendar events"
on public.calendar_events for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins delete calendar events"
on public.calendar_events for delete to authenticated
using (public.is_admin());

grant select, insert, update, delete on public.calendar_events to authenticated;
