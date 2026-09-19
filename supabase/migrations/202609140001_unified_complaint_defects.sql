-- Unified defect intake: one report may contain multiple admin-confirmed work items.
create type public.complaint_defect_status as enum ('pending_admin_review','confirmed','in_progress','pending_material','completed');

create table public.complaint_defects (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  item_group text not null default 'room',
  item_name text not null,
  issue_type text not null,
  other_issue text,
  exact_location text,
  reported_issue text,
  admin_confirmed_issue text,
  maintenance_instruction text,
  status public.complaint_defect_status not null default 'pending_admin_review',
  created_by uuid not null references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  completion_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint complaint_defects_other_issue_check check (issue_type <> 'Other' or nullif(trim(other_issue),'') is not null)
);
create trigger complaint_defects_updated_at before update on public.complaint_defects for each row execute function public.set_updated_at();
create index complaint_defects_complaint_id_idx on public.complaint_defects(complaint_id);
create index complaint_defects_status_idx on public.complaint_defects(status);

alter table public.complaint_defects enable row level security;
create policy "admins manage complaint defects" on public.complaint_defects for all to authenticated
  using (public.is_admin()) with check (public.is_admin() and created_by = auth.uid());
create policy "assigned maintenance reads complaint defects" on public.complaint_defects for select to authenticated
  using (exists (
    select 1 from public.complaints c
    where c.id = complaint_id and c.assigned_to = auth.uid()
  ));
create policy "management reads complaint defects" on public.complaint_defects for select to authenticated using (public.is_management());
grant select,insert,update,delete on public.complaint_defects to authenticated;
