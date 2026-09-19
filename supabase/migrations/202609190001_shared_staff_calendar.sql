-- Shared staff calendar for meetings, training, work arrangements and private reminders.
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 2 and 160),
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  audience text not null default 'individual' check (audience in ('individual', 'all_staff')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  check ((audience = 'all_staff' and assigned_to is null) or (audience = 'individual' and assigned_to is not null))
);
create index calendar_events_assigned_starts_at_idx on public.calendar_events (assigned_to, starts_at);
create index calendar_events_audience_starts_at_idx on public.calendar_events (audience, starts_at);
create trigger calendar_events_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();
alter table public.calendar_events enable row level security;
create policy "calendar visible to recipient and management" on public.calendar_events for select to authenticated using (audience = 'all_staff' or assigned_to = (select auth.uid()) or (select public.is_management()));
create policy "staff create own calendar item" on public.calendar_events for insert to authenticated with check (created_by = (select auth.uid()) and assigned_to = (select auth.uid()) and audience = 'individual');
create policy "staff update own calendar item" on public.calendar_events for update to authenticated using (created_by = (select auth.uid()) and assigned_to = (select auth.uid()) and audience = 'individual') with check (created_by = (select auth.uid()) and assigned_to = (select auth.uid()) and audience = 'individual');
create policy "staff delete own calendar item" on public.calendar_events for delete to authenticated using (created_by = (select auth.uid()) and assigned_to = (select auth.uid()) and audience = 'individual');
create policy "admins manage calendar" on public.calendar_events for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.calendar_events to authenticated;
