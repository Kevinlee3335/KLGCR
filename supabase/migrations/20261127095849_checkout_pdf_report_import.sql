-- PDF intake retains the original Malay findings and source identifiers.
-- Existing room/defect/status/assignment workflows are unchanged.
alter table public.checkout_rooms add column utmspace_pdf_source jsonb;
alter table public.checkout_defects add column utmspace_source_id text,add column utmspace_source_key text,
 add column utmspace_pdf_source jsonb;
alter table public.checkout_photos add column utmspace_pdf_source jsonb;
-- UTMSPACE can repeat a visible DF identifier in another room. Identity must
-- include block and room, while remaining stable across repeated PDF exports.
create unique index checkout_defects_utmspace_source_key_unique
 on public.checkout_defects(utmspace_source_key) where utmspace_source_key is not null;
create index checkout_defects_utmspace_source_id_idx
 on public.checkout_defects(utmspace_source_id) where utmspace_source_id is not null;

-- Only the authenticated Admin's own temporary evidence can be staged.
-- Registered files already follow room participants through the existing
-- "participants read registered inspection evidence" policy.
create policy "admin stages own checkout PDF photos" on storage.objects
 for insert to authenticated with check (
 bucket_id='checkout-evidence' and public.is_admin()
 and name ~ ('^pdf-import/'||auth.uid()::text||'/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'));
create policy "admin reads own checkout PDF staging" on storage.objects
 for select to authenticated using (
 bucket_id='checkout-evidence' and public.is_admin()
 and name ~ ('^pdf-import/'||auth.uid()::text||'/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'));
create policy "admin removes unregistered checkout PDF staging" on storage.objects
 for delete to authenticated using (
 bucket_id='checkout-evidence' and public.is_admin()
 and name ~ ('^pdf-import/'||auth.uid()::text||'/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$')
 and not exists(select 1 from public.checkout_photos p where p.storage_path=storage.objects.name));

create function public.import_checkout_pdf_room(p_room jsonb,p_import_id uuid,p_photos jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 actor uuid:=auth.uid(); room_id uuid; existing_id uuid; defect_id uuid;
 v_block_id integer; block_code text; v_room_no text; room_key text;
 defect_count integer; photo_count integer:=0; existing_count integer;
 d jsonb; photo jsonb; meta jsonb; source_ids text[]; source_keys text[]; source_id text;
 photo_index integer; source_page integer; photo_size bigint; photo_type text;
 storage_name text; prefix text; batch_state text; source_file text; source_hash text;
begin
 if actor is null or not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_import_id is null or jsonb_typeof(p_room) is distinct from 'object'
  or jsonb_typeof(p_photos) is distinct from 'array' then raise exception 'Invalid PDF import request';end if;
 if jsonb_typeof(p_room->'defects') is distinct from 'array' then raise exception 'PDF room needs defect entries';end if;
 defect_count:=jsonb_array_length(p_room->'defects');
 if defect_count<1 or defect_count>50 then raise exception 'Import between 1 and 50 defects per room';end if;
 v_block_id:=(p_room->>'blockId')::integer;block_code:=p_room->>'blockCode';v_room_no:=upper(btrim(p_room->>'roomNo'));
 source_file:=btrim(p_room->>'filename');source_hash:=p_room->>'fileHash';
 if block_code is null or block_code not in ('A','B') or v_room_no is null
  or v_room_no !~ ('^'||block_code||'[0-9]{1,6}$')
  or not exists(select 1 from public.blocks b where b.id=v_block_id and upper(b.code)=block_code)
  then raise exception 'Choose a valid Block A or B room';end if;
 if coalesce(length(source_file),0)<1 or length(source_file)>255 or source_hash is null
  or source_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid source PDF filename or fingerprint';end if;
 for d in select value from jsonb_array_elements(p_room->'defects') loop
  source_id:=d->>'sourceId';
  if jsonb_typeof(d) is distinct from 'object' or source_id is null or source_id !~ '^DF-[0-9]{4}-[0-9]{4,8}$'
   or coalesce(length(btrim(d->>'description')),0)<1 or length(d->>'description')>2000
   or coalesce(length(btrim(d->>'title')),0)<1 or length(d->>'title')>1000
   or coalesce(length(btrim(d->>'originalItem')),0)<1 or length(d->>'originalItem')>1000
   or coalesce(length(btrim(d->>'originalFinding')),0)<1 or length(d->>'originalFinding')>4000
   or coalesce(length(d->>'originalAction'),0)>4000
   or coalesce(length(d->>'sourceStatus'),0)>100
   or jsonb_typeof(d->'photos') is distinct from 'array'
   or coalesce(d->>'pageNumber','') !~ '^[0-9]{1,3}$'
   or (d->>'pageNumber')::integer not between 1 and 250 then raise exception 'Invalid PDF defect entry';end if;
  if d ? 'inspectionId' and d->>'inspectionId' is not null and d->>'inspectionId' !~ '^PM-[0-9]{4}-[0-9]{4,8}$'
   then raise exception 'Invalid inspection reference';end if;
  if d ? 'reportedDate' and d->>'reportedDate' is not null then
   if d->>'reportedDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or to_char((d->>'reportedDate')::date,'YYYY-MM-DD')<>d->>'reportedDate'
    then raise exception 'Invalid PDF reported date';end if;
  end if;
  photo_count:=photo_count+jsonb_array_length(d->'photos');
 end loop;
 select array_agg(value->>'sourceId') into source_ids from jsonb_array_elements(p_room->'defects');
 select array_agg(block_code||':'||v_room_no||':'||x) into source_keys from unnest(source_ids) x;
 if (select count(distinct x) from unnest(source_ids) x)<>defect_count then raise exception 'Duplicate source defect in PDF room';end if;
 if photo_count>20 or jsonb_array_length(p_photos)<>photo_count then raise exception 'Attach every extracted photo, up to 20 per room';end if;
 if (select count(distinct value->>'path') from jsonb_array_elements(p_photos))<>photo_count
  or (select count(distinct ((value->>'sourceId')||':'||(value->>'photoIndex'))) from jsonb_array_elements(p_photos))<>photo_count
  then raise exception 'Duplicate or invalid photo mapping';end if;

 -- The same lock as End Batch prevents an import joining a closing batch.
 perform pg_advisory_xact_lock(hashtextextended('checkout-batch-lifecycle',0));
 select state into batch_state from public.checkout_batches where state in ('active','closing');
 if batch_state='closing' then raise exception 'Batch reports are being generated. Retry after End Batch finishes.';end if;
 select count(*),min(checkout_room_id::text)::uuid into existing_count,existing_id
  from public.checkout_defects where utmspace_source_key=any(source_keys);
 if existing_count>0 then
  if existing_count=defect_count and (select count(distinct checkout_room_id) from public.checkout_defects where utmspace_source_key=any(source_keys))=1 then
   return jsonb_build_object('created',false,'roomId',existing_id,'reason','These UTMSPACE defect references were already imported. Existing records were retained.');
  end if;
  raise exception 'Some UTMSPACE defect references already exist. Review the existing rooms before importing.';
 end if;
 room_key:=substr(v_room_no,2);
 select r.id into existing_id from public.checkout_rooms r
  where r.block_id=v_block_id and r.deleted_at is null and r.batch_archived_at is null
  and regexp_replace(regexp_replace(upper(r.room_no),'[^A-Z0-9]','','g'),'^'||block_code,'')=room_key
  order by r.created_at limit 1;
 if existing_id is not null then
  return jsonb_build_object('created',false,'roomId',existing_id,'reason','This room already exists in the current batch. Existing defects and assignments were retained.');
 end if;

 prefix:='pdf-import/'||actor::text||'/'||p_import_id::text||'/';
 for photo in select value from jsonb_array_elements(p_photos) loop
  storage_name:=photo->>'path';source_id:=photo->>'sourceId';
  if jsonb_typeof(photo) is distinct from 'object' or jsonb_typeof(photo->'photoIndex') is distinct from 'number'
   or coalesce(photo->>'photoIndex','') !~ '^[0-9]{1,2}$'
   or not(source_id=any(source_ids)) or storage_name is null
   or storage_name !~ ('^'||prefix||'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
   then raise exception 'Invalid PDF photo path or source mapping';end if;
  photo_index:=(photo->>'photoIndex')::integer;
  select value into d from jsonb_array_elements(p_room->'defects') where value->>'sourceId'=source_id;
  if photo_index<0 or photo_index>=jsonb_array_length(d->'photos') then raise exception 'Invalid PDF photo index';end if;
  meta:=d->'photos'->photo_index;photo_type:=meta->>'type';
  if jsonb_typeof(meta) is distinct from 'object' or meta->>'label' is null or meta->>'label' not in ('before','after','recheck')
   or coalesce(meta->>'sourcePage','') !~ '^[0-9]{1,3}$' or (meta->>'sourcePage')::integer not between 1 and 250
   or coalesce(meta->>'size','') !~ '^[0-9]{1,8}$' or (meta->>'size')::bigint not between 1 and 10485760
   or photo_type is null or photo_type not in ('image/jpeg','image/png','image/webp')
   or right(storage_name,4)<>(case photo_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else 'webp' end)
   then raise exception 'Invalid PDF photo metadata';end if;
  photo_size:=(meta->>'size')::bigint;source_page:=(meta->>'sourcePage')::integer;
  if not exists(select 1 from storage.objects o where o.bucket_id='checkout-evidence' and o.name=storage_name
   and coalesce((o.metadata->>'size')::bigint,0)=photo_size
   and coalesce(o.metadata->>'mimetype',o.metadata->>'mimeType',o.metadata->>'contentType')=photo_type)
   then raise exception 'Photo upload is incomplete or differs from the extracted PDF photo. Retry before creating this room.';end if;
  if exists(select 1 from public.checkout_photos where storage_path=storage_name) then raise exception 'PDF photo is already registered';end if;
 end loop;

 insert into public.checkout_rooms(block_id,room_no,utmspace_defects,created_by,utmspace_pdf_source)
 values(v_block_id,v_room_no,(select string_agg(value->>'description',E'\n') from jsonb_array_elements(p_room->'defects')),actor,
  jsonb_build_object('filename',source_file,'fileHash',source_hash,'importId',p_import_id,'importedAt',now(),'source','UTMSPACE PDF')) returning id into room_id;
 for d in select value from jsonb_array_elements(p_room->'defects') loop
  insert into public.checkout_defects(checkout_room_id,description,source,status,created_by,utmspace_source_id,utmspace_source_key,utmspace_pdf_source)
  values(room_id,d->>'description','utmspace','open',actor,d->>'sourceId',block_code||':'||v_room_no||':'||(d->>'sourceId'),(d-'photos')||jsonb_build_object('filename',source_file)) returning id into defect_id;
  for photo in select value from jsonb_array_elements(p_photos) where value->>'sourceId'=d->>'sourceId' loop
   meta:=d->'photos'->((photo->>'photoIndex')::integer);
   insert into public.checkout_photos(checkout_room_id,defect_id,kind,storage_path,uploaded_by,utmspace_pdf_source)
   values(room_id,defect_id,'inspection',photo->>'path',actor,
    jsonb_build_object('sourceId',d->>'sourceId','title',d->>'title','label',meta->>'label','sourcePage',meta->'sourcePage','filename',source_file));
  end loop;
 end loop;
 insert into public.checkout_history(checkout_room_id,actor_id,action,notes,to_status)
 values(room_id,actor,'record_created','UTMSPACE PDF imported: '||source_file||'. '||defect_count||' defect(s), '||photo_count||' original evidence photo(s). Awaiting maintenance assignment.','second_inspection');
 return jsonb_build_object('created',true,'roomId',room_id);
end $$;
revoke all on function public.import_checkout_pdf_room(jsonb,uuid,jsonb) from public,anon;
grant execute on function public.import_checkout_pdf_room(jsonb,uuid,jsonb) to authenticated;
