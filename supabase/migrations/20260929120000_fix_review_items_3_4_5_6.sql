-- Requested review fixes: external locations, daily-task progress, reports and Other Item.

-- An External Area has no responsible Block. Existing block complaints remain unchanged.
alter table public.complaints alter column block_id drop not null;
alter table public.maintenance_jobs alter column block_id drop not null;

drop policy if exists "management reads all jobs; staff reads assigned allowed jobs" on public.maintenance_jobs;
create policy "management reads all jobs; staff reads assigned allowed jobs" on public.maintenance_jobs for select to authenticated using (
  public.is_management() or (
    assigned_to = (select auth.uid()) and public.current_role() = 'maintenance_staff' and
    (block_id is null or exists (select 1 from public.profile_blocks pb where pb.profile_id = (select auth.uid()) and pb.block_id = maintenance_jobs.block_id))
  )
);

create or replace function public.assign_complaint_defects(
  p_complaint_id uuid, p_assigned_to uuid, p_defects jsonb,
  p_appointment_date date default null, p_appointment_time time default null,
  p_remarks text default null
) returns table(job_id uuid, job_no text)
language plpgsql security invoker set search_path = '' as $$
declare
  v_complaint public.complaints; v_defect jsonb; v_area text; v_item text; v_issue text; v_note text;
  v_description text; v_category text; v_count integer; v_job_id uuid; v_job_no text; v_seen text[] := array[]::text[];
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into v_complaint from public.complaints where id = p_complaint_id for update;
  if not found then raise exception 'Complaint not found'; end if;
  if v_complaint.status in ('rejected','closed') then raise exception 'Complaint cannot be assigned'; end if;
  if p_defects is null or jsonb_typeof(p_defects) <> 'array' then raise exception 'Select at least one confirmed defect'; end if;
  v_count := jsonb_array_length(p_defects);
  if v_count < 1 or v_count > 10 then raise exception 'Select 1 to 10 defects'; end if;
  if (select count(*) from public.maintenance_jobs where complaint_id = p_complaint_id) + v_count > 10 then raise exception 'A complaint can have at most 10 maintenance defects'; end if;
  if (p_appointment_date is null) <> (p_appointment_time is null) then raise exception 'Maintenance Date and Maintenance Time must either both be provided or both be blank'; end if;
  if v_complaint.source = 'google_form' then
    if lower(trim(coalesce(v_complaint.room_access_permission,''))) not in ('yes','no') then raise exception 'Room access permission must be YES or NO'; end if;
    if lower(trim(v_complaint.room_access_permission)) = 'no' and p_appointment_date is null then raise exception 'Maintenance Date and Maintenance Time are required when room access is NO'; end if;
  end if;
  if not exists (
    select 1 from public.profiles p where p.id=p_assigned_to and p.role='maintenance_staff' and p.is_active and p.deleted_at is null
      and (v_complaint.block_id is null or exists (select 1 from public.profile_blocks pb where pb.profile_id=p.id and pb.block_id=v_complaint.block_id))
  ) then raise exception 'Staff member is not active or allowed for this location'; end if;
  for v_defect in select value from jsonb_array_elements(p_defects) loop
    if jsonb_typeof(v_defect) <> 'object' then raise exception 'Invalid defect'; end if;
    v_area := trim(coalesce(v_defect->>'area','')); v_item := trim(coalesce(v_defect->>'item',''));
    v_issue := trim(coalesce(v_defect->>'issue','')); v_note := trim(coalesce(v_defect->>'note',''));
    if v_area not in ('Room','Bathroom','Common Area') or length(v_item) not between 1 and 100 or length(v_issue) not between 1 and 100 or length(v_note) > 500 then raise exception 'Invalid confirmed defect'; end if;
    v_description := v_area || ' — ' || v_item || ' — ' || v_issue || case when v_note <> '' then ' (' || v_note || ')' else '' end;
    if v_description = any(v_seen) or exists (select 1 from public.maintenance_jobs where complaint_id=p_complaint_id and description=v_description) then raise exception 'Duplicate defect: %', v_description; end if;
    v_seen := array_append(v_seen,v_description);
    v_category := case when v_area='Bathroom' then case when v_item in ('Water Tap / Sink Tap','Shower Valve','Flexible Hose') then 'Plumbing' else 'Bathroom' end when v_item='Air Conditioning' then 'Air Conditioning' when v_item in ('Lighting','Ceiling Fan') then 'Electrical' when v_area='Common Area' then 'Common Area' else 'Room Maintenance' end;
    insert into public.maintenance_jobs(complaint_id,block_id,room_no,category,description,priority,assigned_to) values(v_complaint.id,v_complaint.block_id,v_complaint.room_no,v_category,v_description,v_complaint.priority,p_assigned_to) returning id,maintenance_jobs.job_no into v_job_id,v_job_no;
    if p_appointment_date is not null then insert into public.appointments(complaint_id,job_id,appointment_date,appointment_time,assigned_staff,remarks,created_by) values(v_complaint.id,v_job_id,p_appointment_date,p_appointment_time,p_assigned_to,nullif(trim(p_remarks),''),auth.uid()); end if;
    job_id := v_job_id; job_no := v_job_no; return next;
  end loop;
  update public.complaints set status='assigned',assigned_to=p_assigned_to,assigned_at=coalesce(assigned_at,now()),reviewed_by=auth.uid(),reviewed_at=now() where id=p_complaint_id;
end $$;

-- Daily Tasks keep the same state/history visibility as Maintenance Jobs.
alter table public.admin_daily_tasks drop constraint if exists admin_daily_tasks_status_check;
alter table public.admin_daily_tasks add constraint admin_daily_tasks_status_check check (status in ('pending','accepted','in_progress','completed','kiv'));
alter table public.admin_daily_tasks add column if not exists accepted_at timestamptz;
alter table public.admin_daily_tasks add column if not exists started_at timestamptz;
alter table public.admin_daily_tasks add column if not exists completed_at timestamptz;

create table public.daily_task_activity (
  id bigint generated always as identity primary key,
  task_id bigint not null references public.admin_daily_tasks(id) on delete cascade,
  action text not null,
  comment text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index daily_task_activity_task_created_idx on public.daily_task_activity(task_id,created_at);
alter table public.daily_task_activity enable row level security;
create policy "management reads daily task activity" on public.daily_task_activity for select to authenticated using (public.is_management() or exists (select 1 from public.admin_daily_tasks t where t.id=task_id and t.assigned_to=(select auth.uid())));
grant select on public.daily_task_activity to authenticated;
grant usage,select on sequence public.daily_task_activity_id_seq to authenticated;

create or replace function public.record_daily_task_assigned() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.daily_task_activity(task_id,action,actor_id) values(new.id,'Task Assigned',new.created_by);
  return new;
end $$;
revoke all on function public.record_daily_task_assigned() from public;
drop trigger if exists daily_task_assigned_activity on public.admin_daily_tasks;
create trigger daily_task_assigned_activity after insert on public.admin_daily_tasks for each row execute function public.record_daily_task_assigned();

drop function if exists public.update_assigned_daily_task(bigint,text);
create function public.update_assigned_daily_task(p_id bigint,p_status text,p_comment text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_action text;
begin
  if auth.uid() is null or p_status not in ('accepted','in_progress','completed','kiv') then raise exception 'Invalid request'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and is_active and deleted_at is null) then raise exception 'Inactive account'; end if;
  update public.admin_daily_tasks set status=p_status,updated_at=now(),accepted_at=case when p_status='accepted' then coalesce(accepted_at,now()) else accepted_at end,started_at=case when p_status='in_progress' then coalesce(started_at,now()) else started_at end,completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end where id=p_id and assigned_to=auth.uid();
  if not found then raise exception 'Assigned task not found'; end if;
  v_action := case p_status when 'accepted' then 'Task Accepted' when 'in_progress' then 'In Progress' when 'completed' then 'Completed' else 'KIV' end;
  insert into public.daily_task_activity(task_id,action,comment,actor_id) values(p_id,v_action,nullif(trim(p_comment),''),auth.uid());
end $$;
revoke all on function public.update_assigned_daily_task(bigint,text,text) from public;
grant execute on function public.update_assigned_daily_task(bigint,text,text) to authenticated;

create function public.admin_update_daily_task(p_id bigint,p_status text,p_comment text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_action text;
begin
  if auth.uid() is null or not public.is_admin() or p_status not in ('pending','accepted','in_progress','completed','kiv') then raise exception 'Invalid request'; end if;
  update public.admin_daily_tasks set status=p_status,updated_at=now(),accepted_at=case when p_status='accepted' then coalesce(accepted_at,now()) else accepted_at end,started_at=case when p_status='in_progress' then coalesce(started_at,now()) else started_at end,completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end where id=p_id;
  if not found then raise exception 'Daily task not found'; end if;
  v_action := case p_status when 'pending' then 'Set Pending' when 'accepted' then 'Task Accepted' when 'in_progress' then 'In Progress' when 'completed' then 'Completed' else 'KIV' end;
  insert into public.daily_task_activity(task_id,action,comment,actor_id) values(p_id,v_action,nullif(trim(p_comment),''),auth.uid());
end $$;
revoke all on function public.admin_update_daily_task(bigint,text,text) from public;
grant execute on function public.admin_update_daily_task(bigint,text,text) to authenticated;

-- One exact all-block report at each requested time. It contains only the requested sections.
create or replace function public.write_daily_report(p_type public.report_type,p_group text)
returns void language plpgsql security invoker set search_path='' as $$
declare
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date; counts jsonb; report text; section text; carry integer;
begin
  select jsonb_build_object('scheduled_today',count(*) filter(where j.scheduled_for=today and j.status not in ('completed','cancelled')),'completed_today',count(*) filter(where j.status='completed' and (j.completed_at at time zone 'Asia/Kuala_Lumpur')::date=today),'in_progress',count(*) filter(where j.status='in_progress'),'pending_material',count(*) filter(where j.status='pending_material'),'under_monitoring',count(*) filter(where j.status='under_monitoring')),count(*) filter(where j.status not in ('completed','cancelled')) into counts,carry from public.maintenance_jobs j;
  report := format(E'KLGCR | %s\n📅 %s\n\n📊 TODAY''S SUMMARY\nScheduled: %s\nCompleted: %s\nIn Progress: %s\nPending Material: %s\nUnder Monitoring: %s',case p_type when 'morning_tasks' then '9:30 AM REPORT' else '4:50 PM REPORT' end,to_char(today,'DD/MM/YYYY'),counts->>'scheduled_today',counts->>'completed_today',counts->>'in_progress',counts->>'pending_material',counts->>'under_monitoring');
  select string_agg(public.daily_report_job_text(j),E'\n\n' order by j.assigned_at) into section from public.maintenance_jobs j where j.status='completed' and (j.completed_at at time zone 'Asia/Kuala_Lumpur')::date=today;
  report:=report||E'\n\n✅ COMPLETED TODAY\n'||coalesce(section,'None');
  select string_agg(public.daily_report_job_text(j),E'\n\n' order by j.assigned_at) into section from public.maintenance_jobs j where j.status='pending_material';
  report:=report||E'\n\n🔴 PENDING MATERIAL\n'||coalesce(section,'None');
  select string_agg(public.daily_report_job_text(j),E'\n\n' order by j.assigned_at) into section from public.maintenance_jobs j where j.status='under_monitoring';
  report:=report||E'\n\n🟡 UNDER MONITORING\n'||coalesce(section,'None');
  select string_agg(public.daily_report_job_text(j),E'\n\n' order by j.assigned_at) into section from public.maintenance_jobs j where j.status='in_progress';
  report:=report||E'\n\n🔵 IN PROGRESS\n'||coalesce(section,'None');
  select string_agg('• '||t.title||' | '||replace(t.status,'_',' ')||' | '||coalesce(p.full_name,'Unassigned')||case when t.notes is not null then ' | '||t.notes else '' end,E'\n' order by t.created_at) into section from public.admin_daily_tasks t left join public.profiles p on p.id=t.assigned_to where t.task_date=today;
  report:=report||E'\n\n📋 ADMIN TASKS\n'||coalesce(section,'None');
  select string_agg(format('• %s %s | %s %s | %s | %s',i.item_code,i.description,h.qty,coalesce(i.unit,''),j.job_no,p.full_name),E'\n' order by h.issued_at) into section from public.inventory_issue_history h join public.inventory_items i on i.id=h.inventory_item_id join public.maintenance_jobs j on j.id=h.job_id left join public.profiles p on p.id=h.staff_id where (h.issued_at at time zone 'Asia/Kuala_Lumpur')::date=today;
  report:=report||E'\n\n📦 MATERIAL ISSUED TODAY\n'||coalesce(section,'None')||E'\n\n➡️ CARRY FORWARD TO NEXT DAY: '||carry::text||' JOBS';
  insert into public.report_snapshots(report_type,report_date,block_group,payload,whatsapp_text,source) values(p_type,today,'ALL',counts,report,'automatic');
end $$;

create or replace function public.generate_automatic_report(p_type public.report_type)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_type='inventory_report' then perform public.generate_automatic_report_legacy(p_type); return; end if;
  perform public.write_daily_report(p_type,'ALL');
  if p_type='daily_summary' then perform public.generate_automatic_report_legacy('inventory_report'); end if;
end $$;
select cron.unschedule(jobid) from cron.job where jobname='klgcr-phase5-overall-daily-summary';
select cron.schedule('klgcr-phase5-morning','30 1 * * *',$cron$select public.generate_automatic_report('morning_tasks');$cron$);
select cron.schedule('klgcr-phase5-daily-summary','50 8 * * *',$cron$select public.generate_automatic_report('daily_summary');$cron$);
