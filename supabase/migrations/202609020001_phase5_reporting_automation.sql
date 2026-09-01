-- KLGCR Phase 5: scheduling, Google-form imports and report snapshot history.
create type public.report_type as enum ('morning_tasks','midday_update','daily_summary','progress_snapshot','inventory_report');
create type public.report_source as enum ('manual','automatic');

alter table public.maintenance_jobs add column scheduled_for date;
alter table public.complaints add column source_reference text;
alter table public.complaints add column photo_url text;

create index maintenance_jobs_scheduled_for_idx on public.maintenance_jobs(scheduled_for,status);
create unique index complaints_source_reference_unique on public.complaints(source_reference) where source_reference is not null;

create table public.google_import_history (
  id bigint generated always as identity primary key,
  imported_by uuid not null references public.profiles(id) on delete restrict,
  file_name text,
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  error_rows integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table public.report_snapshots (
  id bigint generated always as identity primary key,
  report_type public.report_type not null,
  report_date date not null default current_date,
  block_group text not null check (block_group in ('AB','CD','ALL')),
  payload jsonb not null default '{}'::jsonb,
  whatsapp_text text not null,
  source public.report_source not null default 'manual',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index report_snapshots_history_idx on public.report_snapshots(report_date desc,report_type,block_group,created_at desc);

alter table public.google_import_history enable row level security;
alter table public.report_snapshots enable row level security;

create policy "management reads import history" on public.google_import_history for select to authenticated using (public.is_management());
create policy "admins write import history" on public.google_import_history for insert to authenticated with check (public.is_admin() and imported_by=auth.uid());
create policy "management reads reports" on public.report_snapshots for select to authenticated using (public.is_management());
create policy "admins create manual reports" on public.report_snapshots for insert to authenticated with check (public.is_admin() and source='manual' and created_by=auth.uid());

revoke update,delete on public.google_import_history,public.report_snapshots from authenticated;
grant select on public.google_import_history,public.report_snapshots to authenticated;
grant insert on public.google_import_history,public.report_snapshots to authenticated;

create function public.schedule_job(p_job_id uuid,p_date date)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.maintenance_jobs set scheduled_for=p_date where id=p_job_id and status not in ('completed','cancelled');
  if not found then raise exception 'Active job not found'; end if;
end $$;

revoke all on function public.schedule_job(uuid,date) from public;
grant execute on function public.schedule_job(uuid,date) to authenticated;
