create table public.flex_inspection_catalog (
  id smallint primary key check (id = 1),
  groups jsonb not null check (jsonb_typeof(groups) = 'array')
);

create table public.flex_inspection_report_templates (
  report_type text primary key check (report_type in ('fire-extinguisher', 'exit-sign', 'emergency-light')),
  content_base64 text not null check (length(content_base64) > 0)
);

create table public.flex_inspections (
  period text primary key check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and period >= '0001-01'),
  revision integer not null default 1 check (revision > 0),
  exceptions jsonb not null default '{}'::jsonb check (
    jsonb_typeof(exceptions) = 'object'
    and not jsonb_path_exists(exceptions, '$.* ? (@.type() != "string")')
  ),
  inspection_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  inspected_by uuid references public.profiles(id),
  inspected_by_name text check (length(btrim(inspected_by_name)) between 1 and 240),
  inspector_signature jsonb check (jsonb_typeof(inspector_signature) = 'object'),
  completed_at timestamptz,
  check (
    (completed_at is null and inspected_by is null and inspected_by_name is null and inspector_signature is null)
    or (completed_at is not null and inspected_by = updated_by and inspected_by is not null and inspected_by_name is not null
      and not jsonb_path_exists(exceptions, '$.* ? (@ like_regex "^[[:space:]]*$")'))
  )
);

alter table public.flex_inspection_catalog enable row level security;
alter table public.flex_inspection_report_templates enable row level security;
alter table public.flex_inspections enable row level security;

revoke all on public.flex_inspection_catalog, public.flex_inspection_report_templates, public.flex_inspections
  from public, anon, authenticated, service_role;
grant select on public.flex_inspection_catalog, public.flex_inspection_report_templates to service_role;
grant select, insert, update on public.flex_inspections to service_role;

create function public.enforce_flex_inspection_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.completed_at is not null then
    raise exception 'A completed Flex inspection cannot be changed';
  end if;
  if new.period <> old.period or new.revision <> old.revision + 1 then
    raise exception 'Invalid Flex inspection revision';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.enforce_flex_inspection_revision() from public, anon, authenticated;

create trigger enforce_flex_inspection_revision
before update on public.flex_inspections
for each row execute function public.enforce_flex_inspection_revision();
