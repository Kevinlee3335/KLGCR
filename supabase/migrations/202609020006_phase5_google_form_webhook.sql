alter table public.complaints
  add column if not exists reporter_name text,
  add column if not exists reporter_phone text,
  add column if not exists reporter_email text,
  add column if not exists availability_date date,
  add column if not exists availability_time text,
  add column if not exists room_access_permission text,
  add column if not exists source_reference text;

create unique index if not exists complaints_source_reference_unique
  on public.complaints (source, source_reference)
  where source_reference is not null;
