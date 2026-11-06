-- Deployment SQL: apply as a tracked migration after testing.
create or replace function public.bulk_assign_checkout_rooms(p_ids uuid[],p_assignee uuid,p_kind text)
 returns integer language plpgsql security invoker set search_path=public as $$
declare r public.checkout_rooms; n integer:=0; has_repairs boolean; has_open boolean;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Only administrators can assign rooms.';end if;
 if p_kind is null or p_kind not in ('maintenance','cleaner') or coalesce(cardinality(p_ids),0) not between 1 and 100 or cardinality(p_ids)<>(select count(distinct id) from unnest(p_ids) id) then raise exception 'Select between 1 and 100 unique rooms.';end if;
 if not exists(select 1 from public.profiles where id=p_assignee and is_active and ((p_kind='maintenance' and role='maintenance_staff' and deleted_at is null) or (p_kind='cleaner' and role='cleaner' and deleted_at is null))) then raise exception 'Select an active worker for this assignment.';end if;
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

-- Atomic admin transfer of a room's outstanding repairs. Completed work is untouched.
create or replace function public.transfer_checkout_task(p_room_id uuid,p_assignee uuid,p_expected_assignee uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
 v_room public.checkout_rooms%rowtype;
 v_target public.profiles%rowtype;
 v_previous text;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Only administrators can transfer check-out tasks.';end if;
 if length(trim(coalesce(p_reason,'')))<3 or length(p_reason)>2000 then raise exception 'Enter a transfer reason between 3 and 2000 characters.';end if;
 select * into v_room from public.checkout_rooms where id=p_room_id and deleted_at is null for update;
 if not found or v_room.status<>'rectification' or v_room.assigned_to is null then raise exception 'Only an assigned room in rectification can be transferred.';end if;
 if v_room.assigned_to is distinct from p_expected_assignee then raise exception 'The assignee has changed. Refresh before transferring.';end if;
 if v_room.assigned_to=p_assignee then raise exception 'Choose a different maintenance staff member.';end if;
 select * into v_target from public.profiles where id=p_assignee and role='maintenance_staff' and is_active=true and deleted_at is null;
 if not found then raise exception 'Choose an active maintenance staff account.';end if;
 select full_name into v_previous from public.profiles where id=v_room.assigned_to;
 update public.checkout_rooms set assigned_to=p_assignee where id=p_room_id;
 insert into public.checkout_history(checkout_room_id,actor_id,action,notes,from_status,to_status)
 values(p_room_id,auth.uid(),'task_transferred',coalesce(v_previous,v_room.assigned_to::text)||' → '||v_target.full_name||'. Reason: '||trim(p_reason),v_room.status,v_room.status);
 return jsonb_build_object('reference_no',v_room.reference_no,'room_no',v_room.room_no,'previous_assignee',v_previous,'new_assignee',v_target.full_name);
end;
$$;
revoke all on function public.transfer_checkout_task(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.transfer_checkout_task(uuid,uuid,uuid,text) to authenticated;
