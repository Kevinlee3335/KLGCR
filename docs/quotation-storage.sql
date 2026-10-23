-- Additive setup for the quotation register. Does not modify existing records.
create table if not exists public.quotation_registry (
 id integer primary key check (id = 1),
 value jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.quotation_registry enable row level security;
create policy "quotation office access" on public.quotation_registry
 for all to authenticated
 using ((select public.current_role()) in ('admin','management_viewer'))
 with check ((select public.current_role()) in ('admin','management_viewer'));
grant select,insert,update on public.quotation_registry to authenticated;
