-- Dedicated, auditable super administrator. Keep the existing app_role=admin for compatibility.
alter table public.profiles add column if not exists is_super_admin boolean not null default false;

update public.profiles
set is_super_admin = true
where id = '7a40e00f-2e95-4c27-83d9-0f7dba788b77'::uuid
  and username = 'kevinlee3335'
  and role = 'admin'
  and is_active = true and deleted_at is null;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists (
   select 1 from public.profiles p
   where p.id = auth.uid()
     and p.id = '7a40e00f-2e95-4c27-83d9-0f7dba788b77'::uuid
     and p.username = 'kevinlee3335'
     and p.role = 'admin'
     and p.is_active
     and p.deleted_at is null
     and p.is_super_admin
 );
$$;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.guard_super_admin_profile()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if new.is_super_admin and new.id <> '7a40e00f-2e95-4c27-83d9-0f7dba788b77'::uuid then
   raise exception 'Super Admin privilege is reserved for the designated account.';
 end if;
 if old.is_super_admin is distinct from new.is_super_admin
    and current_user not in ('postgres','service_role') then
   raise exception 'Super Admin privilege cannot be edited in user management.';
 end if;
 return new;
end;
$$;
drop trigger if exists protect_super_admin_profile on public.profiles;
create trigger protect_super_admin_profile before update on public.profiles
for each row execute function public.guard_super_admin_profile();

-- The existing checkout guard blocks all archived records, including restore.
-- Allow only the designated Super Admin to restore while keeping the guard for everyone else.
create or replace function public.guard_checkout_deleted_room() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if auth.uid() is not null then
  if old.deleted_at is not null and not (public.is_super_admin() and new.deleted_at is null) then
   raise exception 'This check-out record has been removed from active work.';
  end if;
  if new.deleted_at is distinct from old.deleted_at and not (public.is_admin() or public.is_super_admin()) then
   raise exception 'Only authorized administrators can remove or restore check-out records.';
  end if;
 end if;
 return new;
end;
$$;

create table if not exists public.super_admin_audit(
 id bigint generated always as identity primary key,
 actor_id uuid not null references public.profiles(id),
 operation text not null,
 entity_type text not null,
 entity_id uuid not null,
 previous_data jsonb,
 new_data jsonb,
 reason text not null,
 created_at timestamptz not null default now()
);
create index if not exists super_admin_audit_created_idx on public.super_admin_audit(created_at desc);
alter table public.super_admin_audit enable row level security;
drop policy if exists super_admin_audit_read on public.super_admin_audit;
create policy super_admin_audit_read on public.super_admin_audit for select
to authenticated using (public.is_super_admin());
revoke all on public.super_admin_audit from anon, authenticated;
grant select on public.super_admin_audit to authenticated;

-- Specific task updates rather than arbitrary SQL or unrestricted table deletes.
create or replace function public.super_admin_update_maintenance_job(
 p_job uuid,p_status text,p_reason text,p_review_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare j public.maintenance_jobs%rowtype; updated public.maintenance_jobs%rowtype; note text;
begin
 if not public.is_super_admin() then raise exception 'Super Admin access required.'; end if;
 note := trim(coalesce(p_reason,''));
 if length(note)<3 or length(note)>2000 then raise exception 'Reason must be 3–2000 characters.'; end if;
 if p_status is null or p_status not in ('assigned','in_progress','pending_material','under_monitoring','completed','cancelled') then
   raise exception 'Invalid maintenance job status.';
 end if;
 if p_status='under_monitoring' and (p_review_at is null or (p_review_at at time zone 'Asia/Kuala_Lumpur')::date <= (now() at time zone 'Asia/Kuala_Lumpur')::date) then
   raise exception 'Choose a future monitoring review date.';
 end if;

 select * into j from public.maintenance_jobs where id=p_job for update;
 if not found then raise exception 'Maintenance job not found.'; end if;
 if j.status::text=p_status then raise exception 'This job already has the selected status.'; end if;

 update public.maintenance_jobs
 set status=p_status::public.job_status,
     completed_at=case when p_status='completed' then now() else null end,
     started_at=case when p_status='in_progress' then coalesce(started_at,now()) else started_at end,
     monitoring_review_at=case when p_status='under_monitoring' then p_review_at else null end,
     monitoring_started_at=case when p_status='under_monitoring' then coalesce(monitoring_started_at,now()) else monitoring_started_at end,
     monitoring_note=case when p_status='under_monitoring' then note else monitoring_note end,
     pending_material_note=case when p_status='pending_material' then note else pending_material_note end,
     action_taken=case when p_status='completed' then concat_ws(E'\n',nullif(action_taken,''),'Super Admin completion: '||note) else action_taken end
 where id=p_job returning * into updated;

 if j.status='completed' and p_status<>'completed' and j.complaint_id is not null then
   update public.complaints set status='assigned',updated_at=now()
     where id=j.complaint_id and status='closed';
 end if;

 insert into public.job_status_history(job_id,previous_status,new_status,note,changed_by)
 values(p_job,j.status,p_status::public.job_status,'Super Admin: '||note,auth.uid());

 insert into public.super_admin_audit(actor_id,operation,entity_type,entity_id,previous_data,new_data,reason)
 values(auth.uid(),'update_status','maintenance_job',p_job,to_jsonb(j),to_jsonb(updated),note);

 return jsonb_build_object('job_no',j.job_no,'old_status',j.status,'new_status',p_status);
end;
$$;
revoke all on function public.super_admin_update_maintenance_job(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.super_admin_update_maintenance_job(uuid,text,text,timestamptz) to authenticated;

create or replace function public.super_admin_manage_checkout(
 p_room uuid,p_operation text,p_reason text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.checkout_rooms%rowtype; updated public.checkout_rooms%rowtype; note text;
begin
 if not public.is_super_admin() then raise exception 'Super Admin access required.'; end if;
 note := trim(coalesce(p_reason,''));
 if length(note)<3 or length(note)>2000 then raise exception 'Reason must be 3–2000 characters.'; end if;

 select * into r from public.checkout_rooms where id=p_room for update;
 if not found then raise exception 'Check-out room not found.'; end if;

 if p_operation='complete_cleaning' then
   if r.deleted_at is not null or r.status<>'cleaning' or r.cleaner_id is null then
     raise exception 'Room is not an active assigned cleaning task.';
   end if;
   if exists(select 1 from public.checkout_defects d where d.checkout_room_id=r.id
     and d.description !~* '^\s*no defects?[.!]?\s*$' and d.status<>'rectified') then
     raise exception 'Room has unfinished repair defects.';
   end if;
   update public.checkout_rooms set status='ready_for_occupancy',ready_at=now()
     where id=p_room returning * into updated;
   insert into public.checkout_history(checkout_room_id,actor_id,action,notes,from_status,to_status)
     values(p_room,auth.uid(),'super_admin_cleaning_completed',note,'cleaning','ready_for_occupancy');
 elsif p_operation='reopen_cleaning' then
   if r.deleted_at is not null or r.status<>'ready_for_occupancy' or r.cleaner_id is null then
     raise exception 'Only a completed room with a cleaner may be reopened.';
   end if;
   update public.checkout_rooms set status='cleaning',ready_at=null
     where id=p_room returning * into updated;
   insert into public.checkout_history(checkout_room_id,actor_id,action,notes,from_status,to_status)
     values(p_room,auth.uid(),'super_admin_cleaning_reopened',note,'ready_for_occupancy','cleaning');
 elsif p_operation='archive_duplicate' then
   if r.deleted_at is not null then raise exception 'Room is already archived.'; end if;
   update public.checkout_rooms set deleted_at=now(),deletion_reason=note
     where id=p_room returning * into updated;
   insert into public.checkout_history(checkout_room_id,actor_id,action,notes,from_status,to_status)
     values(p_room,auth.uid(),'super_admin_duplicate_archived',note,r.status,r.status);
 elsif p_operation='restore_archived' then
   if r.deleted_at is null then raise exception 'Room is not archived.'; end if;
   update public.checkout_rooms set deleted_at=null,deletion_reason=null
     where id=p_room returning * into updated;
   insert into public.checkout_history(checkout_room_id,actor_id,action,notes,from_status,to_status)
     values(p_room,auth.uid(),'super_admin_record_restored',note,r.status,r.status);
 else raise exception 'Unsupported Super Admin operation.'; end if;

 insert into public.super_admin_audit(actor_id,operation,entity_type,entity_id,previous_data,new_data,reason)
 values(auth.uid(),p_operation,'checkout_room',p_room,to_jsonb(r),to_jsonb(updated),note);

 return jsonb_build_object('reference_no',r.reference_no,'room_no',r.room_no,'operation',p_operation);
end;
$$;
revoke all on function public.super_admin_manage_checkout(uuid,text,text) from public,anon;
grant execute on function public.super_admin_manage_checkout(uuid,text,text) to authenticated;
