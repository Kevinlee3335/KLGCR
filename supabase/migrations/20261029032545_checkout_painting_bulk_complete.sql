-- Complete selected painting tasks atomically without changing unrelated repairs.
create function public.complete_checkout_painting(p_tasks jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare expected integer; matched integer; entry record;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 if p_tasks is null or jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks)<1 then raise exception 'Select at least one painting task'; end if;
 expected:=jsonb_array_length(p_tasks);
 if (select count(distinct x.id) from jsonb_to_recordset(p_tasks) as x(id uuid,updated_at timestamptz))<>expected then raise exception 'Duplicate painting tasks'; end if;
 perform t.id from public.checkout_paint_tasks t join jsonb_to_recordset(p_tasks) as x(id uuid,updated_at timestamptz) on t.id=x.id order by t.id for update of t;
 select count(*) into matched from public.checkout_paint_tasks t join jsonb_to_recordset(p_tasks) as x(id uuid,updated_at timestamptz) on t.id=x.id and t.updated_at=x.updated_at where t.status<>'completed';
 if matched<>expected then raise exception 'A selected task changed. Refresh the list and select again'; end if;
 for entry in update public.checkout_paint_tasks set status='completed' where id in (select x.id from jsonb_to_recordset(p_tasks) as x(id uuid,updated_at timestamptz)) returning checkout_room_id,worker_name loop
  insert into public.checkout_history(checkout_room_id,actor_id,action,notes) values(entry.checkout_room_id,auth.uid(),'painting_completed','Painting completed by General Worker: '||entry.worker_name);
 end loop;
 return expected;
end $$;
revoke all on function public.complete_checkout_painting(jsonb) from public,anon;
grant execute on function public.complete_checkout_painting(jsonb) to authenticated;
