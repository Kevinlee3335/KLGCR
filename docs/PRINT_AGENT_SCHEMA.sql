begin;
create table public.klg_print_device (
 id integer primary key check(id=1), token_hash text not null unique,
 name text not null, auto_enabled boolean not null default false,
 enabled_from text, last_seen timestamptz, printer text,
 created_at timestamptz not null default now(), created_by uuid not null references public.profiles(id)
);
create table public.klg_print_jobs (
 id uuid primary key default gen_random_uuid(), dedupe_key text not null unique,
 kind text not null check(kind in ('rental','test')), period text,
 status text not null default 'queued' check(status in ('queued','claimed','submitted','failed')),
 attempt integer not null default 1, device_hash text, snapshot jsonb,
 created_at timestamptz not null default now(), claimed_at timestamptz, completed_at timestamptz,
 printer text, error text, retry_reason text, created_by uuid references public.profiles(id)
);
create index klg_print_jobs_pending on public.klg_print_jobs(created_at) where status='queued';
alter table public.klg_print_device enable row level security;
alter table public.klg_print_jobs enable row level security;
create policy "No direct printer device access" on public.klg_print_device for all to anon,authenticated using(false) with check(false);
create policy "No direct print queue access" on public.klg_print_jobs for all to anon,authenticated using(false) with check(false);
revoke all on public.klg_print_device,public.klg_print_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.klg_print_device,public.klg_print_jobs to service_role;
comment on table public.klg_print_device is 'Server-only printer credential hashes; never exposed to browser or anonymous roles.';
comment on table public.klg_print_jobs is 'Submitted means Windows accepted submission, not proof of physical printing. Claimed jobs never auto-requeue.';
commit;
