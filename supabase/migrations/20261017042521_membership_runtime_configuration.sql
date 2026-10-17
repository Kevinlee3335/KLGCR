-- Membership-only encryption key. Never exposed through public or authenticated Data API access.
-- This is a newly generated application secret, not an existing authentication credential.
create table public.membership_runtime (
 id boolean primary key default true check (id),
 token_secret text not null check(length(token_secret) >= 64),
 created_at timestamptz not null default now()
);
alter table public.membership_runtime enable row level security;
revoke all on public.membership_runtime from public,anon,authenticated;
grant select on public.membership_runtime to service_role;
insert into public.membership_runtime(id,token_secret)
values(true,replace(gen_random_uuid()::text || gen_random_uuid()::text,'-',''));
