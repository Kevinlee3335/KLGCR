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
 select * into v_target from public.profiles where id=p_assignee and role='maintenance_staff' and is_active=true and (full_name ilike '%Abdullah%' or full_name ilike '%Faiz%');
 if not found then raise exception 'Choose an active Abdullah or Faiz account.';end if;
 select full_name into v_previous from public.profiles where id=v_room.assigned_to;
 update public.checkout_rooms set assigned_to=p_assignee where id=p_room_id;
 insert into public.checkout_history(checkout_room_id,actor_id,action,notes,from_status,to_status)
 values(p_room_id,auth.uid(),'task_transferred',coalesce(v_previous,v_room.assigned_to::text)||' → '||v_target.full_name||'. Reason: '||trim(p_reason),v_room.status,v_room.status);
 return jsonb_build_object('reference_no',v_room.reference_no,'room_no',v_room.room_no,'previous_assignee',v_previous,'new_assignee',v_target.full_name);
end;
$$;
revoke all on function public.transfer_checkout_task(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.transfer_checkout_task(uuid,uuid,uuid,text) to authenticated;
