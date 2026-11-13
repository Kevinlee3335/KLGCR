-- Check linked approvals across assignees without exposing request records.
create function public.has_pending_job_material_approval(p_job_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.current_role() is distinct from 'maintenance_staff' then
    raise exception 'Maintenance staff access required';
  end if;

  if not exists (
    select 1 from public.maintenance_jobs j
    where j.id = p_job_id and j.assigned_to = auth.uid()
      and j.status in ('in_progress', 'under_monitoring', 'pending_material')
      and (j.block_id is null or exists (
        select 1 from public.profile_blocks pb where pb.profile_id = auth.uid() and pb.block_id = j.block_id
      ))
  ) then
    raise exception 'Job not found or cannot be completed';
  end if;

  return exists (
    select 1 from public.material_requests where job_id = p_job_id and status = 'pending'
  );
end $$;

revoke all on function public.has_pending_job_material_approval(uuid) from public, anon;
grant execute on function public.has_pending_job_material_approval(uuid) to authenticated;

-- Save photo records and the status change in one transaction. Request creation
-- locks the same job row before inserting, so it cannot race past this check.
create function public.complete_assigned_job(p_job_id uuid, p_action_taken text, p_photo_paths text[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_previous public.job_status;
begin
  if auth.uid() is null or public.current_role() is distinct from 'maintenance_staff' then
    raise exception 'Maintenance staff access required';
  end if;
  if nullif(trim(p_action_taken), '') is null then raise exception 'Action taken is required'; end if;

  select j.status into v_previous from public.maintenance_jobs j
  where j.id = p_job_id and j.assigned_to = auth.uid()
  for update;
  if not found then raise exception 'Job not found or cannot be completed'; end if;
  if public.has_pending_job_material_approval(p_job_id) then
    raise exception 'Material request is still pending approval';
  end if;

  if p_photo_paths is not null then
    if cardinality(p_photo_paths) not between 1 and 20 or exists (
      select 1 from unnest(p_photo_paths) as photo(path)
      where path is null or path !~ ('^' || p_job_id::text || '/completion/[0-9a-f-]{36}[.](jpg|png|webp)$')
    ) or cardinality(p_photo_paths) <> (select count(distinct path) from unnest(p_photo_paths) as photo(path)) then
      raise exception 'Attach between 1 and 20 valid completion photos.';
    end if;
    insert into public.maintenance_job_photos(job_id, storage_path, uploaded_by)
    select p_job_id, path, auth.uid() from unnest(p_photo_paths) as photo(path);
  end if;

  update public.maintenance_jobs set status = 'completed', action_taken = trim(p_action_taken), completed_at = now()
  where id = p_job_id;
  insert into public.job_status_history(job_id, previous_status, new_status, note, changed_by)
  values (p_job_id, v_previous, 'completed', trim(p_action_taken), auth.uid());
end $$;

revoke all on function public.complete_assigned_job(uuid, text, text[]) from public, anon;
grant execute on function public.complete_assigned_job(uuid, text, text[]) to authenticated;

-- Keep the deployed app's two-argument RPC working while the frontend rolls out.
create or replace function public.complete_assigned_job(p_job_id uuid, p_action_taken text)
returns void language sql security invoker set search_path = '' as $$
  select public.complete_assigned_job(p_job_id, p_action_taken, null::text[]);
$$;

create or replace function public.create_material_request(p_job_id uuid,p_note text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request uuid; v_item jsonb; v_item_id uuid; v_other text;
begin
  if auth.uid() is null or public.current_role() is distinct from 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  perform 1 from public.maintenance_jobs j where j.id=p_job_id and j.assigned_to=auth.uid()
    and j.status in ('in_progress','pending_material') and (j.block_id is null or exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id))
  for update;
  if not found then raise exception 'Job not found or not allowed'; end if;
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
