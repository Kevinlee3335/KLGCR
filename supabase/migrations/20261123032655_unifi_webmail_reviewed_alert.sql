alter table public.unifi_webmail_connection
  add column if not exists reviewed_check_at timestamptz,
  add column if not exists reviewed_error text,
  add column if not exists reviewed_by uuid references public.profiles(id);
