-- Extend the Servicing & Compliance tracker with the fields on the current paper registers.

alter table public.compliance_records
  add column if not exists frequency text,
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text;
