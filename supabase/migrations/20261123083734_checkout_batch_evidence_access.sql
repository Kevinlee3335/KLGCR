-- Management can include historical evidence even when a room was soft-removed.
create policy "management reads batch history evidence" on storage.objects
 for select to authenticated using(bucket_id='checkout-evidence' and public.is_management()
 and exists(select 1 from public.checkout_photos p join public.checkout_rooms r on r.id=p.checkout_room_id where p.storage_path=storage.objects.name and r.batch_id is not null));
-- Owner staging permissions cannot delete or replace frozen batch evidence.
create policy "retain frozen checkout evidence deletes" on storage.objects as restrictive
 for delete to authenticated using(bucket_id<>'checkout-evidence' or not exists(
  select 1 from public.checkout_photos p join public.checkout_rooms r on r.id=p.checkout_room_id join public.checkout_batches b on b.id=r.batch_id
  where p.storage_path=storage.objects.name and b.state in ('closing','closed')));
create policy "retain frozen checkout evidence updates" on storage.objects as restrictive
 for update to authenticated using(bucket_id<>'checkout-evidence' or not exists(
  select 1 from public.checkout_photos p join public.checkout_rooms r on r.id=p.checkout_room_id join public.checkout_batches b on b.id=r.batch_id
  where p.storage_path=storage.objects.name and b.state in ('closing','closed')))
 with check(bucket_id<>'checkout-evidence' or not exists(
  select 1 from public.checkout_photos p join public.checkout_rooms r on r.id=p.checkout_room_id join public.checkout_batches b on b.id=r.batch_id
  where p.storage_path=storage.objects.name and b.state in ('closing','closed')));
