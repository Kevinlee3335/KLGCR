begin;
create table public.billing_preview_settings (
 id integer primary key check (id=1), config jsonb not null,
 revision integer not null default 0 check(revision>=0),
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id));
create table public.billing_preview_runs (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('rental','utility')),
 period text not null check(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 issue_date date not null, total numeric(14,2) not null,
 snapshot jsonb not null check(snapshot->>'testMode'='true'),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 unique(kind,period));
alter table public.billing_preview_settings enable row level security;
alter table public.billing_preview_runs enable row level security;
revoke all on public.billing_preview_settings, public.billing_preview_runs from anon, authenticated;
grant select,update on public.billing_preview_settings to authenticated;
grant select,insert on public.billing_preview_runs to authenticated;
create policy "billing preview settings read" on public.billing_preview_settings for select to authenticated using (public.current_role() in ('admin','management_viewer'));
create policy "billing preview settings edit" on public.billing_preview_settings for update to authenticated using (public.current_role() in ('admin','management_viewer')) with check (public.current_role() in ('admin','management_viewer'));
create policy "billing preview runs read" on public.billing_preview_runs for select to authenticated using (public.current_role() in ('admin','management_viewer'));
create policy "billing preview runs insert" on public.billing_preview_runs for insert to authenticated with check (public.current_role() in ('admin','management_viewer') and created_by=(select auth.uid()) and snapshot->>'testMode'='true');
-- Initial data is imported privately from the user-provided files; not committed to this public repository.
commit;
