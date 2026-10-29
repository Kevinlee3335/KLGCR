-- Preserve incorrect assignments as cancelled, never delete room or repair records.
alter table public.checkout_paint_tasks drop constraint checkout_paint_tasks_status_check;
alter table public.checkout_paint_tasks add constraint checkout_paint_tasks_status_check check(status in ('assigned','in_progress','completed','cancelled'));
drop index public.checkout_paint_active_room_idx;
create unique index checkout_paint_active_room_idx on public.checkout_paint_tasks(checkout_room_id) where status in ('assigned','in_progress');
create function public.checkout_room_needs_painting(p_room uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.checkout_defects where checkout_room_id=p_room and status='open' and description ~* '\mpaint(ing)?\M|\mmou?ld(y)?\M|\m(wall|ceiling)\M.*(stain|dirty|peel|damp|water[[:space:]]*mark|seepage)|(stain|dirty|peel|damp|water[[:space:]]*mark|seepage).*\m(wall|ceiling)\M')
$$;
revoke all on function public.checkout_room_needs_painting(uuid) from public,anon;
grant execute on function public.checkout_room_needs_painting(uuid) to authenticated;
create or replace function public.validate_checkout_paint_task() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.checkout_rooms where id=new.checkout_room_id and deleted_at is null and status<>'ready_for_occupancy' for update;
 if not found then raise exception 'Room is unavailable or already ready for occupancy'; end if;
 if tg_op='INSERT' and not public.checkout_room_needs_painting(new.checkout_room_id) then raise exception 'Room has no open painting defect'; end if;
 if tg_op='UPDATE' and (new.checkout_room_id<>old.checkout_room_id or new.created_by<>old.created_by) then raise exception 'Task source cannot be changed'; end if;
 new.completed_at:=case when new.status='completed' then coalesce(new.completed_at,now()) else null end;
 return new;
end $$;
create or replace function public.checkout_paint_readiness_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='ready_for_occupancy' and old.status<>'ready_for_occupancy' and exists(select 1 from public.checkout_paint_tasks where checkout_room_id=new.id and status in ('assigned','in_progress')) then raise exception 'Complete General Worker painting tasks before marking the room ready'; end if;
 return new;
end $$;
-- Complete selected painting tasks atomically without changing unrelated repairs.
create or replace function public.complete_checkout_painting(p_tasks jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare expected integer; matched integer; entry record;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 if p_tasks is null or jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks)<1 then raise exception 'Select at least one painting task'; end if;
 expected:=jsonb_array_length(p_tasks);
 if (select count(distinct x.id) from jsonb_to_recordset(p_tasks) as x(id uuid,updated_at timestamptz))<>expected then raise exception 'Duplicate painting tasks'; end if;
 perform t.id from public.checkout_paint_tasks t join jsonb_to_recordset(p_tasks) as x(id uuid,updated_at timestamptz) on t.id=x.id order by t.id for update of t;
 select count(*) into matched from public.checkout_paint_tasks t join jsonb_to_recordset(p_tasks) as x(id uuid,updated_at timestamptz) on t.id=x.id and t.updated_at=x.updated_at where t.status in ('assigned','in_progress');
 if matched<>expected then raise exception 'A selected task changed. Refresh the list and select again'; end if;
 for entry in update public.checkout_paint_tasks set status='completed' where id in (select x.id from jsonb_to_recordset(p_tasks) as x(id uuid,updated_at timestamptz)) returning checkout_room_id,worker_name loop
  insert into public.checkout_history(checkout_room_id,actor_id,action,notes) values(entry.checkout_room_id,auth.uid(),'painting_completed','Painting completed by General Worker: '||entry.worker_name);
 end loop;
 return expected;
end $$;
revoke all on function public.complete_checkout_painting(jsonb) from public,anon;
grant execute on function public.complete_checkout_painting(jsonb) to authenticated;

-- Correct the confirmed erroneous A509 and A801 assignments only.
update public.checkout_paint_tasks p set status='cancelled',notes=coalesce(p.notes||E'\n','')||'Assignment cancelled: no painting requirement (Admin correction).'
 from public.checkout_rooms r join public.blocks b on b.id=r.block_id
 where p.checkout_room_id=r.id and b.code='A' and r.room_no in ('509','801') and r.deleted_at is null and p.status='assigned' and not public.checkout_room_needs_painting(r.id)
 returning p.checkout_room_id;
