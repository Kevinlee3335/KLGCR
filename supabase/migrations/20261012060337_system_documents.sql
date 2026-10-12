create table public.system_documents (
 id uuid primary key,
 file_name text not null check(length(file_name) between 1 and 255),
 storage_path text not null unique,
 size_bytes bigint not null check(size_bytes >= 0),
 uploaded_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table public.system_documents enable row level security;
grant select, insert, delete on public.system_documents to authenticated;
create policy "active users read documents" on public.system_documents for select to authenticated using (public.current_role() is not null);
create policy "management upload documents" on public.system_documents for insert to authenticated with check (public.is_management() and uploaded_by = (select auth.uid()) and split_part(storage_path,'/',1) = (select auth.uid())::text and split_part(storage_path,'/',2) = id::text);
create policy "management delete documents" on public.system_documents for delete to authenticated using (public.is_management());
insert into storage.buckets(id,name,public,file_size_limit) values ('system-documents','system-documents',false,52428800);
create policy "active users read document files" on storage.objects for select to authenticated using (bucket_id='system-documents' and public.current_role() is not null);
create policy "management upload document files" on storage.objects for insert to authenticated with check (bucket_id='system-documents' and public.is_management() and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "management delete document files" on storage.objects for delete to authenticated using (bucket_id='system-documents' and public.is_management());
