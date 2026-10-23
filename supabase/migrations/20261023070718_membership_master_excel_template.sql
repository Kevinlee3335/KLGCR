-- Original workbook and parsed layout are uploaded privately; no member PII belongs in this repository.
create table public.membership_master_templates(
 id text primary key,source_file text not null,sha256 text not null,
 workbook_base64 text not null default '',layout jsonb,ready boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.membership_master_templates enable row level security;
revoke all on public.membership_master_templates from public,anon,authenticated;
grant select on public.membership_master_templates to service_role;
