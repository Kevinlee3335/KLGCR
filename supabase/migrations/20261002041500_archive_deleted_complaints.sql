-- Keep a read-only archive when an admin deletes an unassigned complaint.
-- Existing deleted complaints cannot be recovered because they were permanently removed before this archive existed.
create table if not exists public.deleted_complaints
  (like public.complaints including all);

alter table public.deleted_complaints
  add column if not exists deleted_at timestamptz not null default now(),
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

alter table public.deleted_complaints enable row level security;

drop policy if exists "management reads deleted complaints" on public.deleted_complaints;
create policy "management reads deleted complaints"
on public.deleted_complaints for select to authenticated
using (public.is_management());

drop policy if exists "admins archive deleted complaints" on public.deleted_complaints;
create policy "admins archive deleted complaints"
on public.deleted_complaints for insert to authenticated
with check (public.is_admin());
