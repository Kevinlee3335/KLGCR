insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fire-safety-inspection-archive',
  'fire-safety-inspection-archive',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do nothing;
