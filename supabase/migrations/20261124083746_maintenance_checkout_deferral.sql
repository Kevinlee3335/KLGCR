alter table public.maintenance_jobs
  add column checkout_date date,
  add column checkout_note text,
  add constraint maintenance_job_checkout_date_required check (status <> 'waiting_checkout' or checkout_date is not null);
create index maintenance_jobs_checkout_waiting_idx on public.maintenance_jobs(checkout_date, id) where status='waiting_checkout';

-- Uses the same Super Admin authorization and audit trail as other overrides.
create or replace function public.super_admin_wait_for_checkout(p_job uuid, p_checkout_date date, p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare j public.maintenance_jobs%rowtype; updated public.maintenance_jobs%rowtype; note text;
begin
  if auth.uid() is null or not public.is_super_admin() then raise exception 'Super Admin access required.'; end if;
  note := trim(coalesce(p_reason,''));
  if length(note)<3 or length(note)>2000 then raise exception 'Reason must be 3–2000 characters.'; end if;
  if p_checkout_date is null then raise exception 'Choose the check-out date.'; end if;
  select * into j from public.maintenance_jobs where id=p_job for update;
  if not found then raise exception 'Maintenance job not found.'; end if;
  if j.status='cancelled' then raise exception 'Restore this cancelled job before scheduling check-out repairs.'; end if;

  update public.maintenance_jobs set status='waiting_checkout', checkout_date=p_checkout_date, checkout_note=note,
    completed_at=null, monitoring_review_at=null, scheduled_for=p_checkout_date
    where id=p_job returning * into updated;
  if j.status='completed' and j.complaint_id is not null then
    update public.complaints set status='assigned', updated_at=now() where id=j.complaint_id and status='closed';
  end if;
  insert into public.job_status_history(job_id,previous_status,new_status,note,changed_by)
    values(p_job,j.status,'waiting_checkout','Repair after check-out on '||to_char(p_checkout_date,'DD Mon YYYY')||'. Super Admin: '||note,auth.uid());
  insert into public.super_admin_audit(actor_id,operation,entity_type,entity_id,previous_data,new_data,reason)
    values(auth.uid(),'update_status','maintenance_job',p_job,to_jsonb(j),to_jsonb(updated),note);
  return jsonb_build_object('job_no',j.job_no,'old_status',j.status,'new_status','waiting_checkout','checkout_date',p_checkout_date);
end;
$$;
revoke all on function public.super_admin_wait_for_checkout(uuid,date,text) from public,anon;
grant execute on function public.super_admin_wait_for_checkout(uuid,date,text) to authenticated;

-- Existing callers may still start ordinary assigned work during a rolling release.
-- Waiting jobs require both the Malaysia check-out date and explicit confirmation.
create or replace function public.start_assigned_job(p_job_id uuid, p_checkout_confirmed boolean)
returns void language plpgsql security definer set search_path=''
as $$
declare j public.maintenance_jobs%rowtype;
begin
  if auth.uid() is null or public.current_role() is distinct from 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  select * into j from public.maintenance_jobs
    where id=p_job_id and assigned_to=auth.uid() and status in ('assigned','waiting_checkout')
      and (block_id is null or exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=maintenance_jobs.block_id))
    for update;
  if not found then raise exception 'Assigned job not found or cannot be started'; end if;
  if j.status='waiting_checkout' then
    if j.checkout_date is null or j.checkout_date>(now() at time zone 'Asia/Kuala_Lumpur')::date then
      raise exception 'Wait until the scheduled check-out date before starting repairs.';
    end if;
    if p_checkout_confirmed is distinct from true then raise exception 'Confirm the tenant has checked out before starting repairs.'; end if;
  end if;
  update public.maintenance_jobs set status='in_progress', started_at=coalesce(started_at,now()) where id=p_job_id;
  insert into public.job_status_history(job_id,previous_status,new_status,note,changed_by)
    values(p_job_id,j.status,'in_progress',case when j.status='waiting_checkout' then 'Tenant check-out confirmed. Repairs started after check-out on '||to_char(j.checkout_date,'DD Mon YYYY')||'.' else null end,auth.uid());
end;
$$;
revoke all on function public.start_assigned_job(uuid,boolean) from public,anon;
grant execute on function public.start_assigned_job(uuid,boolean) to authenticated;

create or replace function public.start_assigned_job(p_job_id uuid)
returns void language sql security invoker set search_path=''
as $$ select public.start_assigned_job(p_job_id,false); $$;

create or replace function public.admin_dashboard_counts()
returns table(new_complaints bigint,today_tasks bigint,completed_today bigint,outstanding bigint)
language sql stable set search_path='public'
as $$
  select
    (select count(*) from public.complaints where status='new')::bigint,
    (select count(*) from public.maintenance_jobs where scheduled_for=(now() at time zone 'Asia/Kuala_Lumpur')::date and status not in ('completed','cancelled'))::bigint,
    (select count(*) from public.maintenance_jobs where status='completed' and (completed_at at time zone 'Asia/Kuala_Lumpur')::date=(now() at time zone 'Asia/Kuala_Lumpur')::date)::bigint,
    (select count(*) from public.maintenance_jobs where status in ('assigned','in_progress','pending_material','under_monitoring','waiting_checkout'))::bigint;
$$;
notify pgrst, 'reload schema';
