-- Cleaner reports are submitted by the signed-in cleaner.  Do not depend on a
-- server service key for this workflow: it can otherwise fail before a photo
-- upload is prepared.

create or replace function public.cleaner_owns_complaint_path(p_complaint_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_role() = 'cleaner' and exists (
    select 1
    from public.complaints c
    where c.id::text = p_complaint_id
      and c.source = 'cleaning'
      and c.source_reference like ('cleaner:' || auth.uid()::text || ':%')
  ), false)
$$;

revoke all on function public.cleaner_owns_complaint_path(text) from public;
grant execute on function public.cleaner_owns_complaint_path(text) to authenticated;

drop policy if exists "cleaners upload own complaint evidence" on storage.objects;
create policy "cleaners upload own complaint evidence"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'checkout-evidence'
  and (storage.foldername(name))[1] = 'complaints'
  and public.cleaner_owns_complaint_path((storage.foldername(name))[2])
);

drop policy if exists "cleaners remove own complaint evidence" on storage.objects;
create policy "cleaners remove own complaint evidence"
on storage.objects for delete to authenticated
using (
  bucket_id = 'checkout-evidence'
  and (storage.foldername(name))[1] = 'complaints'
  and public.cleaner_owns_complaint_path((storage.foldername(name))[2])
);

drop policy if exists "cleaners delete own unsubmitted reports" on public.complaints;
create policy "cleaners delete own unsubmitted reports"
on public.complaints for delete to authenticated
using (
  public.current_role() = 'cleaner'
  and source = 'cleaning'
  and source_reference like ('cleaner:' || auth.uid()::text || ':%')
  and photo_url is null
);

create or replace function public.finalize_cleaner_complaint(
  p_complaint_id uuid,
  p_path text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_complaint_no text;
begin
  if not public.cleaner_owns_complaint_path(p_complaint_id::text)
     or p_path !~ ('^complaints/' || p_complaint_id::text || '/[^/]+\\.jpg$') then
    raise exception 'Complaint verification failed.';
  end if;

  update public.complaints
  set photo_url = 'storage://checkout-evidence/' || p_path
  where id = p_complaint_id
  returning complaint_no into v_complaint_no;

  return v_complaint_no;
end;
$$;

revoke all on function public.finalize_cleaner_complaint(uuid, text) from public;
grant execute on function public.finalize_cleaner_complaint(uuid, text) to authenticated;
