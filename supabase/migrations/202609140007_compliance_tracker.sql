-- Admin servicing, certificates and licence tracker.
-- Keeps compliance work separate from complaints, check-out rooms and maintenance jobs.

create table if not exists public.compliance_records (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('servicing', 'certificate_license')),
  title text not null,
  provider text,
  reference_no text,
  last_completed_date date,
  next_due_date date not null,
  status text not null default 'active' check (status in ('active', 'renewal_in_progress', 'expired', 'completed')),
  notes text,
  created_by uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists compliance_records_type_due_idx
  on public.compliance_records(record_type, next_due_date);

alter table public.compliance_records enable row level security;

create policy "admin and viewer read compliance records"
on public.compliance_records
for select
to authenticated
using (public.current_role() in ('admin', 'management_viewer'));

create policy "admins create compliance records"
on public.compliance_records
for insert
to authenticated
with check (
  public.current_role() = 'admin'
  and created_by = (select auth.uid())
);

create policy "admins update compliance records"
on public.compliance_records
for update
to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create policy "admins delete compliance records"
on public.compliance_records
for delete
to authenticated
using (public.current_role() = 'admin');

grant select, insert, update, delete on public.compliance_records to authenticated;
