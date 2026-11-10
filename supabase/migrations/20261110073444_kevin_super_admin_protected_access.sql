-- Block demotion/deactivation and accidental replacement of the designated Super Admin.
create or replace function public.guard_super_admin_profile()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if new.is_super_admin and new.id <> '7a40e00f-2e95-4c27-83d9-0f7dba788b77'::uuid then
   raise exception 'Super Admin privilege is reserved for the designated account.';
 end if;
 if old.is_super_admin and (
   new.is_super_admin is distinct from old.is_super_admin
   or new.role::text <> 'admin'
   or new.username <> 'kevinlee3335'
   or not new.is_active
   or new.deleted_at is not null
 ) then
   raise exception 'The Super Admin account cannot be demoted or disabled by user management.';
 end if;
 if old.is_super_admin is distinct from new.is_super_admin and current_user <> 'postgres' then
   raise exception 'Super Admin privilege is managed by protected migrations only.';
 end if;
 return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.assign_checkout_cleaner(p_room uuid, p_cleaner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.checkout_rooms;
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and (p.username in ('fikri','mary') or public.is_super_admin()) and p.is_active and p.deleted_at is null) then raise exception 'Not authorized'; end if;
 if not exists(select 1 from public.profiles p where p.id=p_cleaner and p.role='cleaner' and p.is_active and p.deleted_at is null) then raise exception 'Select an active cleaner'; end if;
 select * into r from public.checkout_rooms where id=p_room and deleted_at is null for update;
 if not found or r.cleaner_id is not null or not ((r.status='verification' and not exists(select 1 from public.checkout_defects d where d.checkout_room_id=r.id and d.description !~* '^\s*no defects?[.!]?\s*$' and d.status<>'rectified')) or (r.status='second_inspection' and r.utmspace_defects ~* '^\s*no defects?[.!]?\s*$' and not exists(select 1 from public.checkout_defects d where d.checkout_room_id=r.id and d.description !~* '^\s*no defects?[.!]?\s*$'))) then raise exception 'This room is no longer available for assignment'; end if;
 update public.checkout_rooms set cleaner_id=p_cleaner,status='cleaning' where id=r.id;
 insert into public.checkout_history(checkout_room_id,actor_id,action,from_status,to_status) values(r.id,auth.uid(),'handed_to_housekeeping',r.status,'cleaning');
 return jsonb_build_object('reference_no',r.reference_no,'room_no',r.room_no);
end $function$;

CREATE OR REPLACE FUNCTION public.checkout_housekeeping_queue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists (select 1 from public.profiles p where p.id=auth.uid() and (p.username in ('fikri','mary') or public.is_super_admin()) and p.is_active and p.deleted_at is null) then raise exception 'Not authorized'; end if;
 return jsonb_build_object(
  'rooms', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reference_no',r.reference_no,'room_no',r.room_no,'block',b.code) order by b.code,r.room_no)
    from public.checkout_rooms r join public.blocks b on b.id=r.block_id
    where r.deleted_at is null and r.cleaner_id is null
      and ((r.status='verification' and not exists(select 1 from public.checkout_defects d where d.checkout_room_id=r.id and d.description !~* '^\s*no defects?[.!]?\s*$' and d.status<>'rectified'))
       or (r.status='second_inspection' and r.utmspace_defects ~* '^\s*no defects?[.!]?\s*$' and not exists(select 1 from public.checkout_defects d where d.checkout_room_id=r.id and d.description !~* '^\s*no defects?[.!]?\s*$')))), '[]'::jsonb),
  'cleaners',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name) order by p.full_name) from public.profiles p where p.role='cleaner' and p.is_active and p.deleted_at is null),'[]'::jsonb));
end $function$;

