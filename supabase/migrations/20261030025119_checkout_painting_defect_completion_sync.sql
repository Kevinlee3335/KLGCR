create or replace function public.sync_completed_painting_defects(p_task uuid) returns integer language plpgsql security invoker set search_path='' as $$
declare t public.checkout_paint_tasks%rowtype; n integer; previous public.checkout_status;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 select * into t from public.checkout_paint_tasks where id=p_task and status='completed';
 if not found then raise exception 'Completed painting task required'; end if;
 select status into previous from public.checkout_rooms where id=t.checkout_room_id and deleted_at is null for update;
 if not found then return 0; end if;
 update public.checkout_defects set status='rectified',rectified_by=auth.uid(),rectified_at=t.completed_at
 where checkout_room_id=t.checkout_room_id and status='open' and created_at<=t.completed_at
 and description ~* '\mpaint(ing)?\M|\mmou?ld(y)?\M|\m(wall|ceiling)\M.*(stain|dirty|peel|damp|water[[:space:]]*mark|seepage)|(stain|dirty|peel|damp|water[[:space:]]*mark|seepage).*\m(wall|ceiling)\M';
 get diagnostics n=row_count;
 if n>0 then
 insert into public.checkout_history(checkout_room_id,actor_id,action,notes)
 values(t.checkout_room_id,auth.uid(),'painting_defects_rectified','Painting task '||t.id||' ('||t.worker_name||'): '||n||' matching defects rectified.');
 if previous='rectification' and not exists(select 1 from public.checkout_defects where checkout_room_id=t.checkout_room_id and status='open' and description !~* '^\s*no defects?[.!]?\s*$')
 and not exists(select 1 from public.checkout_paint_tasks where checkout_room_id=t.checkout_room_id and status in ('assigned','in_progress')) then
 update public.checkout_rooms set status='verification' where id=t.checkout_room_id;
 insert into public.checkout_history(checkout_room_id,actor_id,action,notes,from_status,to_status)
 values(t.checkout_room_id,auth.uid(),'rectification_completed','All repair defects completed after painting. Ready for cleaner assignment.',previous,'verification');
 end if;
 end if;
 return n;
end $$;
revoke all on function public.sync_completed_painting_defects(uuid) from public,anon;
grant execute on function public.sync_completed_painting_defects(uuid) to authenticated;
create or replace function public.sync_checkout_paint_completion() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform public.sync_completed_painting_defects(new.id);
 return new;
end $$;
revoke all on function public.sync_checkout_paint_completion() from public,anon;
create trigger sync_checkout_paint_completion after update of status on public.checkout_paint_tasks
for each row when (new.status='completed' and old.status is distinct from new.status)
execute function public.sync_checkout_paint_completion();
