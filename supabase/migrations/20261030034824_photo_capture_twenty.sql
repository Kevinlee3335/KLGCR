alter table public.complaints add column if not exists photo_paths text[] not null default '{}';
alter table public.complaints add constraint complaints_photo_paths_twenty check (cardinality(photo_paths) <= 20);
alter table public.waste_collections drop constraint waste_collections_photos_check;
alter table public.waste_collections add constraint waste_collections_photos_check check (cardinality(photos) between 1 and 20);

create or replace function public.finalize_cleaner_complaint_photos(p_complaint_id uuid, p_paths text[])
returns text language plpgsql security definer set search_path = '' as $$
declare v_number text;
begin
 if not coalesce(public.cleaner_owns_complaint_path(p_complaint_id::text),false) then raise exception 'Complaint verification failed.'; end if;
 if coalesce(cardinality(p_paths),0) not between 1 and 20 or
    (select count(distinct p) from unnest(p_paths) p) <> cardinality(p_paths) then
   raise exception 'Attach between 1 and 20 unique photos.';
 end if;
 if exists(select 1 from unnest(p_paths) p where p is null or p !~ ('^complaints/' || p_complaint_id::text || '/[a-f0-9-]{36}[.]jpg$')
   or not exists(select 1 from storage.objects o where o.bucket_id='checkout-evidence' and o.name=p and coalesce((o.metadata->>'size')::bigint,0)>0)) then
   raise exception 'Photo upload is incomplete.';
 end if;
 update public.complaints set photo_paths=p_paths, photo_url='storage://checkout-evidence/' || p_paths[1]
 where id=p_complaint_id returning complaint_no into v_number;
 return v_number;
end $$;
revoke all on function public.finalize_cleaner_complaint_photos(uuid,text[]) from public, anon;
grant execute on function public.finalize_cleaner_complaint_photos(uuid,text[]) to authenticated;
