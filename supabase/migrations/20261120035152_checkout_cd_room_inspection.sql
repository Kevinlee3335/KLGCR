-- Extend the existing atomic room inspection flow to the approved C/D checklist.
create or replace function public.submit_ab_checkout_inspection(
 p_id uuid,p_block text,p_room text,p_pax integer,p_notes text,p_checklist jsonb,p_findings jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.checkout_rooms; b smallint; f jsonb; photo text; d uuid; descriptions text; n integer:=0;
begin
 if auth.uid() is null or not (public.is_admin() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.username in ('fadhil','ariffin') and p.role='cleaner' and p.is_active and p.deleted_at is null)) then raise exception 'Not authorized to submit inspections.';end if;
 if p_id is null or p_block is null or p_room is null or p_pax is null or p_block not in ('A','B','C','D') or p_room !~ '^[0-9]{3}$' or p_pax not between 1 and 20 or length(p_notes)>4000 or jsonb_typeof(p_findings) is distinct from 'array' or jsonb_array_length(p_findings)>100 or pg_column_size(p_checklist)>200000 then raise exception 'Invalid inspection.';end if;
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
 insert into public.checkout_history(checkout_room_id,actor_id,action,notes,to_status) values(r.id,auth.uid(),case when p_block in ('C','D') then 'cd_inspection_submitted' else 'ab_inspection_submitted' end,p_notes,'second_inspection');
 return jsonb_build_object('id',r.id,'reference_no',r.reference_no);
end;$$;
revoke all on function public.submit_ab_checkout_inspection(uuid,text,text,integer,text,jsonb,jsonb) from public,anon;
grant execute on function public.submit_ab_checkout_inspection(uuid,text,text,integer,text,jsonb,jsonb) to authenticated;


