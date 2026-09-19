-- Maintenance job completion evidence.
create table if not exists public.maintenance_job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.maintenance_jobs(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('maintenance-evidence','maintenance-evidence',false,10485760,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do nothing;

alter table public.maintenance_job_photos enable row level security;

create policy "job participants read maintenance photos" on public.maintenance_job_photos
for select to authenticated using (
  public.is_management() or exists(
    select 1 from public.maintenance_jobs j where j.id=job_id and j.assigned_to=auth.uid()
  )
);
create policy "assigned staff add maintenance photos" on public.maintenance_job_photos
for insert to authenticated with check (
  uploaded_by=auth.uid() and exists(
    select 1 from public.maintenance_jobs j where j.id=job_id and j.assigned_to=auth.uid()
  )
);
create policy "maintenance evidence read" on storage.objects
for select to authenticated using (
  bucket_id='maintenance-evidence' and exists(
    select 1 from public.maintenance_jobs j
    where (storage.foldername(name))[1]=j.id::text
      and (public.is_management() or j.assigned_to=auth.uid())
  )
);
create policy "maintenance evidence upload" on storage.objects
for insert to authenticated with check (
  bucket_id='maintenance-evidence' and exists(
    select 1 from public.maintenance_jobs j
    where (storage.foldername(name))[1]=j.id::text and j.assigned_to=auth.uid()
  )
);
grant select,insert on public.maintenance_job_photos to authenticated;
