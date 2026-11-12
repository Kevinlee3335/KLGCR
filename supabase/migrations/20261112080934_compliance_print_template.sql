-- The uploaded Excel template is used only through authenticated compliance routes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'compliance-print-templates',
  'compliance-print-templates',
  false,
  3145728,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do nothing;
