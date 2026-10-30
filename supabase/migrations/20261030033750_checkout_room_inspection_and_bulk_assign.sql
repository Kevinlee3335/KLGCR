-- Checklist snapshot and idempotent creation share the existing check-out workflow.
alter table public.checkout_rooms add column if not exists inspection_checklist jsonb;

-- A staged upload belongs to its administrator, before the room is committed.
create policy "admin own inspection staging" on storage.objects for all to authenticated
 using(bucket_id='checkout-evidence' and public.is_admin() and (storage.foldername(name))[1]=auth.uid()::text and (storage.foldername(name))[2]='inspection')
 with check(bucket_id='checkout-evidence' and public.is_admin() and (storage.foldername(name))[1]=auth.uid()::text and (storage.foldername(name))[2]='inspection');

create or replace function public.submit_ab_checkout_inspection(
 p_id uuid,p_block text,p_room text,p_pax integer,p_notes text,p_checklist jsonb,p_findings jsonb
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare r public.checkout_rooms; b smallint; f jsonb; photo text; d uuid; descriptions text; n integer:=0;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Only administrators can submit inspections.';end if;
 if p_id is null or p_block is null or p_room is null or p_pax is null or p_block not in ('A','B') or p_room !~ '^[0-9]{3}$' or p_pax not between 1 and 20 or length(p_notes)>4000 or jsonb_typeof(p_findings) is distinct from 'array' or jsonb_array_length(p_findings)>100 or pg_column_size(p_checklist)>200000 then raise exception 'Invalid inspection.';end if;
 perform pg_advisory_xact_lock(hashtextextended('ab-inspection:'||p_block||p_room,0));
 select * into r from public.checkout_rooms where id=p_id;
 if found then return jsonb_build_object('id',r.id,'reference_no',r.reference_no);end if;
 select id into b from public.blocks where code=p_block;
 if b is null then raise exception 'Block not found.';end if;
 if exists(select 1 from public.checkout_rooms where block_id=b and regexp_replace(upper(room_no),'[^0-9]','','g')=p_room and deleted_at is null and status<>'ready_for_occupancy') then raise exception 'This room already has an active check-out record. Open the existing record to update or assign it.';end if;
 for f in select value from jsonb_array_elements(p_findings) loop
  if jsonb_typeof(f->'photos') is distinct from 'array' or length(coalesce(f->>'description',''))>2000 then raise exception 'Invalid defect or photo list.';end if;
  for photo in select jsonb_array_elements_text(f->'photos') loop
   n:=n+1;
   if n>20 or photo !~ ('^'||auth.uid()::text||'/inspection/'||p_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$') then raise exception 'Maximum 20 valid photos per room.';end if;
   if not exists(select 1 from storage.objects where bucket_id='checkout-evidence' and name=photo and coalesce((metadata->>'size')::bigint,0)>0) then raise exception 'Photo upload is incomplete. Retry before submitting.';end if;
  end loop;
 end loop;
 select string_agg(value->>'description',E'\n') into descriptions from jsonb_array_elements(p_findings) where length(trim(value->>'description'))>0;
 insert into public.checkout_rooms(id,block_id,room_no,utmspace_defects,inspection_notes,inspection_checklist,occupancy_pax,created_by)
 values(p_id,b,p_room,coalesce(descriptions,'No Defect'),p_notes,p_checklist,p_pax,auth.uid()) returning * into r;
 for f in select value from jsonb_array_elements(p_findings) loop
  d:=null;
  if length(trim(f->>'description'))>0 then
   insert into public.checkout_defects(checkout_room_id,description,source,created_by) values(r.id,f->>'description','second_inspection',auth.uid()) returning id into d;
  end if;
  for photo in select jsonb_array_elements_text(f->'photos') loop
   insert into public.checkout_photos(checkout_room_id,defect_id,kind,storage_path,uploaded_by) values(r.id,d,'inspection',photo,auth.uid());
  end loop;
 end loop;
 insert into public.checkout_history(checkout_room_id,actor_id,action,notes,to_status) values(r.id,auth.uid(),'ab_inspection_submitted',p_notes,'second_inspection');
 return jsonb_build_object('id',r.id,'reference_no',r.reference_no);
end;$$;
revoke all on function public.submit_ab_checkout_inspection(uuid,text,text,integer,text,jsonb,jsonb) from public,anon;
grant execute on function public.submit_ab_checkout_inspection(uuid,text,text,integer,text,jsonb,jsonb) to authenticated;

create or replace function public.bulk_assign_checkout_rooms(p_ids uuid[],p_assignee uuid,p_kind text)
 returns integer language plpgsql security invoker set search_path=public as $$
declare r public.checkout_rooms; n integer:=0; has_repairs boolean; has_open boolean;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Only administrators can assign rooms.';end if;
 if p_kind is null or p_kind not in ('maintenance','cleaner') or coalesce(cardinality(p_ids),0) not between 1 and 100 or cardinality(p_ids)<>(select count(distinct id) from unnest(p_ids) id) then raise exception 'Select between 1 and 100 unique rooms.';end if;
 if not exists(select 1 from public.profiles where id=p_assignee and is_active and ((p_kind='maintenance' and role='maintenance_staff' and (full_name ilike '%Abdullah%' or full_name ilike '%Faiz%')) or (p_kind='cleaner' and role='cleaner'))) then raise exception 'Select an active worker for this assignment.';end if;
 for r in select * from public.checkout_rooms where id=any(p_ids) and deleted_at is null order by id for update loop
  select coalesce(bool_or(description !~* '^no defects?[.!]?$'),false),coalesce(bool_or(description !~* '^no defects?[.!]?$' and status<>'rectified'),false) into has_repairs,has_open from public.checkout_defects where checkout_room_id=r.id;
  if p_kind='maintenance' then
   if r.status<>'second_inspection' or r.assigned_to is not null or not has_repairs then raise exception 'A selected room is no longer awaiting maintenance assignment. Refresh and select again.';end if;
   update public.checkout_rooms set assigned_to=p_assignee,status='rectification' where id=r.id;
  else
   if r.cleaner_id is not null or not ((r.status='second_inspection' and not has_repairs and r.utmspace_defects ~* '^no defects?[.!]?$') or (r.status='verification' and not has_open)) then raise exception 'A selected room is not ready for cleaner assignment. Refresh and select again.';end if;
   update public.checkout_rooms set cleaner_id=p_assignee,status='cleaning' where id=r.id;
  end if;
  insert into public.checkout_history(checkout_room_id,actor_id,action,notes,from_status,to_status) values(r.id,auth.uid(),'bulk_assigned',p_kind||' assigned to '||p_assignee::text,r.status,case when p_kind='maintenance' then 'rectification'::public.checkout_status else 'cleaning'::public.checkout_status end);
  n:=n+1;
 end loop;
 if n<>cardinality(p_ids) then raise exception 'One or more selected rooms no longer exist.';end if;
 return n;
end;$$;
revoke all on function public.bulk_assign_checkout_rooms(uuid[],uuid,text) from public,anon;
grant execute on function public.bulk_assign_checkout_rooms(uuid[],uuid,text) to authenticated;

-- Evidence stays private and follows the same room participants after assignment.
create policy "participants read registered inspection evidence" on storage.objects for select to authenticated
 using(bucket_id='checkout-evidence' and exists(
 select 1 from public.checkout_photos p join public.checkout_rooms r on r.id=p.checkout_room_id
 where p.storage_path=name and r.deleted_at is null and (public.is_management() or r.assigned_to=auth.uid() or r.cleaner_id=auth.uid())));
