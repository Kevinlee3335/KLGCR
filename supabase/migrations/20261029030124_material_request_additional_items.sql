create or replace function public.create_material_request(p_job_id uuid,p_note text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request uuid; v_item jsonb; v_item_id uuid; v_other text;
begin
  if auth.uid() is null or public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  if not exists(select 1 from public.maintenance_jobs j where j.id=p_job_id and j.assigned_to=auth.uid()
    and j.status in ('in_progress','pending_material') and (j.block_id is null or exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id)))
    then raise exception 'Job not found or not allowed'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 then raise exception 'Select at least one material'; end if;
  insert into public.material_requests(job_id,requested_by,note) values(p_job_id,auth.uid(),nullif(trim(p_note),'')) returning id into v_request;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'qty')::numeric,0)<=0 then raise exception 'Invalid quantity'; end if;
    v_item_id:=nullif(v_item->>'inventory_item_id','')::uuid;
    v_other:=nullif(trim(v_item->>'other_item_name'),'');
    if v_item_id is null then
      if v_other is null or length(v_other)>200 then raise exception 'Enter the Other item name'; end if;
    elsif not exists(select 1 from public.inventory_items where id=v_item_id and is_active) then raise exception 'Inventory item not found'; end if;
    insert into public.material_request_items(request_id,inventory_item_id,other_item_name,requested_qty)
      values(v_request,v_item_id,case when v_item_id is null then v_other end,(v_item->>'qty')::numeric);
  end loop;
  if exists(select 1 from public.maintenance_jobs where id=p_job_id and status='in_progress') then
    perform public.set_job_pending_material(p_job_id,coalesce(nullif(trim(p_note),''),'Material requested'));
  end if;
  return v_request;
end $$;
create or replace function public.create_checkout_material_request(p_checkout_id uuid,p_note text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request uuid; v_item jsonb; v_item_id uuid; v_other text;
begin
 if auth.uid() is null or public.current_role() is distinct from 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
 perform 1 from public.checkout_rooms where id=p_checkout_id and assigned_to=auth.uid() and status='rectification' and deleted_at is null for update;
 if not found then raise exception 'Room is not assigned to you for rectification'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 then raise exception 'Select at least one material'; end if;
 insert into public.material_requests(checkout_room_id,requested_by,note) values(p_checkout_id,auth.uid(),nullif(trim(p_note),'')) returning id into v_request;
 for v_item in select * from jsonb_array_elements(p_items) loop
  if coalesce((v_item->>'qty')::numeric,0)<=0 or (v_item->>'qty')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid quantity'; end if;
  v_item_id:=nullif(v_item->>'inventory_item_id','')::uuid; v_other:=nullif(trim(v_item->>'other_item_name'),'');
  if v_item_id is null then
   if v_other is null or length(v_other)>200 then raise exception 'Enter the Other item name'; end if;
  elsif not exists(select 1 from public.inventory_items where id=v_item_id and is_active) then raise exception 'Inventory item not found'; end if;
  if exists(select 1 from public.material_request_items where request_id=v_request and (inventory_item_id=v_item_id or (v_item_id is null and lower(other_item_name)=lower(v_other)))) then raise exception 'Duplicate material'; end if;
  insert into public.material_request_items(request_id,inventory_item_id,other_item_name,requested_qty) values(v_request,v_item_id,case when v_item_id is null then v_other end,(v_item->>'qty')::numeric);
 end loop;
 insert into public.checkout_history(checkout_room_id,actor_id,action,notes) values(p_checkout_id,auth.uid(),'material_requested',nullif(trim(p_note),''));
 return v_request;
end $$;
revoke all on function public.create_checkout_material_request(uuid,text,jsonb) from public,anon;
grant execute on function public.create_checkout_material_request(uuid,text,jsonb) to authenticated;


revoke all on function public.create_material_request(uuid,text,jsonb) from public,anon;
grant execute on function public.create_material_request(uuid,text,jsonb) to authenticated;
