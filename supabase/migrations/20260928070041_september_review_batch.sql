-- Review batch: apply only to the test database until Kevin approves release.
create table public.job_assignment_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.maintenance_jobs(id),
  previous_staff uuid not null references public.profiles(id),
  assigned_staff uuid not null references public.profiles(id),
  changed_by uuid not null references public.profiles(id),
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.job_assignment_history enable row level security;
create index job_assignment_history_job_idx on public.job_assignment_history(job_id,created_at);
create policy "participants read transfers" on public.job_assignment_history for select to authenticated
using (public.is_management() or exists(select 1 from public.maintenance_jobs j where j.id=job_id and j.assigned_to=(select auth.uid())));
create policy "admins record transfers" on public.job_assignment_history for insert to authenticated
with check (public.is_admin() and changed_by=(select auth.uid()));
grant select,insert on public.job_assignment_history to authenticated;

create function public.transfer_maintenance_job(p_job_id uuid,p_staff_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare j public.maintenance_jobs;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into j from public.maintenance_jobs where id=p_job_id for update;
  if not found or j.status in ('completed','cancelled') then raise exception 'Active job not found'; end if;
  if j.assigned_to=p_staff_id then raise exception 'Choose a different employee'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Transfer reason is required'; end if;
  if not exists(select 1 from public.profiles p join public.profile_blocks pb on pb.profile_id=p.id
    where p.id=p_staff_id and p.role='maintenance_staff' and p.is_active and p.deleted_at is null and pb.block_id=j.block_id)
    then raise exception 'Employee is not permitted for this block'; end if;
  insert into public.job_assignment_history(job_id,previous_staff,assigned_staff,changed_by,reason)
    values(j.id,j.assigned_to,p_staff_id,auth.uid(),trim(p_reason));
  update public.maintenance_jobs set assigned_to=p_staff_id where id=j.id;
  update public.appointments set assigned_staff=p_staff_id where job_id=j.id and status in ('pending_confirmation','confirmed','rescheduled');
end $$;
revoke all on function public.transfer_maintenance_job(uuid,uuid,text) from public;
grant execute on function public.transfer_maintenance_job(uuid,uuid,text) to authenticated;

alter table public.material_request_items alter column inventory_item_id drop not null;
alter table public.material_request_items add column other_item_name text;
alter table public.material_request_items add constraint material_item_has_name check
  (inventory_item_id is not null or (other_item_name is not null and length(trim(other_item_name)) between 1 and 200));
create or replace function public.create_material_request(p_job_id uuid,p_note text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request uuid; v_item jsonb; v_item_id uuid; v_other text;
begin
  if auth.uid() is null or public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  if not exists(select 1 from public.maintenance_jobs j where j.id=p_job_id and j.assigned_to=auth.uid()
    and j.status in ('in_progress','pending_material') and exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id))
    then raise exception 'Job not found or not allowed'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 3 then raise exception 'Select 1 to 3 materials'; end if;
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
-- An Other request must be matched to real stock before the existing issue RPC deducts it.
create function public.require_stock_before_issue() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.status='issued' and old.status<>'issued' and exists(select 1 from public.material_request_items where request_id=new.id and inventory_item_id is null) then
    raise exception 'Match Other items to inventory before issuing material';
  end if;
  return new;
end $$;
create trigger require_stock_before_issue before update on public.material_requests for each row execute function public.require_stock_before_issue();

create function public.match_other_material(p_request_id uuid,p_request_item_id uuid,p_inventory_item_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  perform 1 from public.material_requests where id=p_request_id and status in ('pending','approved') for update;
  if not found then raise exception 'Open material request not found'; end if;
  if not exists(select 1 from public.inventory_items where id=p_inventory_item_id and is_active) then raise exception 'Active inventory item not found'; end if;
  update public.material_request_items set inventory_item_id=p_inventory_item_id
    where id=p_request_item_id and request_id=p_request_id and inventory_item_id is null and other_item_name is not null;
  if not found then raise exception 'Other item not found'; end if;
end $$;
revoke all on function public.match_other_material(uuid,uuid,uuid) from public;
grant execute on function public.match_other_material(uuid,uuid,uuid) to authenticated;

create table public.recurring_daily_tasks (
  id uuid primary key default gen_random_uuid(),title text not null check(length(trim(title))>0),notes text,
  assigned_to uuid not null references public.profiles(id),created_by uuid not null references public.profiles(id),
  frequency text not null check(frequency in ('weekly','monthly')),day_number integer not null,
  starts_on date not null, is_active boolean not null default true,
  check((frequency='weekly' and day_number between 0 and 6) or (frequency='monthly' and day_number between 1 and 31))
);
alter table public.recurring_daily_tasks enable row level security;
create policy "management reads recurring tasks" on public.recurring_daily_tasks for select to authenticated using(public.is_management());
create policy "admin manages recurring tasks" on public.recurring_daily_tasks for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.recurring_daily_tasks to authenticated;
alter table public.admin_daily_tasks add column assigned_to uuid references public.profiles(id);
alter table public.admin_daily_tasks add column recurrence_id uuid references public.recurring_daily_tasks(id);
create unique index admin_daily_tasks_recurrence_date_idx on public.admin_daily_tasks(recurrence_id,task_date);
create index admin_daily_tasks_assignee_date_idx on public.admin_daily_tasks(assigned_to,task_date);
create policy "employees read assigned daily tasks" on public.admin_daily_tasks for select to authenticated using(assigned_to=(select auth.uid()));

create function public.materialize_recurring_tasks(p_date date default (now() at time zone 'Asia/Kuala_Lumpur')::date)
returns void language sql security invoker set search_path='' as $$
  insert into public.admin_daily_tasks(task_date,title,notes,assigned_to,created_by,recurrence_id)
  select p_date,title,notes,assigned_to,created_by,id from public.recurring_daily_tasks
  where is_active and starts_on<=p_date
  and (auth.uid() is null or created_by=auth.uid())
  and exists(select 1 from public.profiles p where p.id=assigned_to and p.is_active and p.deleted_at is null)
  and (
    (frequency='weekly' and extract(dow from p_date)=day_number) or
    (frequency='monthly' and extract(day from p_date)=least(day_number,extract(day from (date_trunc('month',p_date)+interval '1 month - 1 day')))))
  on conflict(recurrence_id,task_date) do nothing;
$$;
revoke all on function public.materialize_recurring_tasks(date) from public;
grant execute on function public.materialize_recurring_tasks(date) to authenticated;
select cron.schedule('klgcr-recurring-daily-tasks','5 16 * * *', $cron$select public.materialize_recurring_tasks();$cron$);

-- Restricted status operation: staff cannot edit an assignment, title or recurrence.
create function public.update_assigned_daily_task(p_id bigint,p_status text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or p_status not in ('pending','in_progress','completed','kiv') then raise exception 'Invalid request'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and is_active and deleted_at is null) then raise exception 'Inactive account'; end if;
  update public.admin_daily_tasks set status=p_status,updated_at=now() where id=p_id and assigned_to=auth.uid();
  if not found then raise exception 'Assigned task not found'; end if;
end $$;
revoke all on function public.update_assigned_daily_task(bigint,text) from public;
grant execute on function public.update_assigned_daily_task(bigint,text) to authenticated;

-- Preserve deleted complaint details for the requested history filter.
create table public.deleted_complaints (
  id uuid primary key,complaint_no text not null,block_id smallint,room_no text,category text,description text,priority text,
  submitted_at timestamptz,deleted_at timestamptz not null default now(),deleted_by uuid
);
alter table public.deleted_complaints enable row level security;
create policy "management reads deleted complaints" on public.deleted_complaints for select to authenticated using(public.is_management());
create policy "admin archives complaints" on public.deleted_complaints for insert to authenticated with check(public.is_admin() and deleted_by=(select auth.uid()));
grant select,insert on public.deleted_complaints to authenticated;
create function public.archive_deleted_complaint() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  insert into public.deleted_complaints(id,complaint_no,block_id,room_no,category,description,priority,submitted_at,deleted_by)
  values(old.id,old.complaint_no,old.block_id,old.room_no,old.category,old.description,old.priority::text,old.submitted_at,auth.uid());
  return old;
end $$;
create trigger archive_deleted_complaint before delete on public.complaints for each row execute function public.archive_deleted_complaint();

create function public.daily_report_job_text(p_job public.maintenance_jobs)
returns text language sql stable security invoker set search_path='' as $$
  select concat_ws(E'\n',p_job.job_no,
    '📍 Block '||b.code||' | Room '||p_job.room_no,
    '🔧 '||p_job.category||' — '||p_job.description,'👤 '||coalesce(p.full_name,'Unassigned'),
    case when p_job.status='pending_material' then coalesce((
      select string_agg('📦 '||coalesce(i.item_code,'Other')||' '||coalesce(i.description,ri.other_item_name,'Material')||' | '||ri.requested_qty::text||' '||coalesce(i.unit,''),E'\n' order by r.created_at,ri.id)
      from public.material_requests r join public.material_request_items ri on ri.request_id=r.id
      left join public.inventory_items i on i.id=ri.inventory_item_id
      where r.job_id=p_job.id and r.status in ('pending','approved')
    ),'📦 No outstanding material request recorded') end)
  from public.blocks b left join public.profiles p on p.id=p_job.assigned_to where b.id=p_job.block_id;
$$;
revoke all on function public.daily_report_job_text(public.maintenance_jobs) from public;

-- Cron-only helper. No browser role can invoke this or the automatic writers.
create function public.write_daily_report(p_type public.report_type,p_group text)
returns void language plpgsql security invoker set search_path='' as $$
declare
  today date:=(now() at time zone 'Asia/Kuala_Lumpur')::date;
  codes text[]:=case p_group when 'AB' then array['A','B'] when 'CD' then array['C','D'] else array['A','B','C','D'] end;
  counts jsonb; report text; section text; state text; heading text; carry integer;
begin
  select jsonb_build_object(
    'scheduled_today',count(*) filter(where j.scheduled_for=today and j.status not in ('completed','cancelled')),
    'completed_today',count(*) filter(where j.status='completed' and (j.completed_at at time zone 'Asia/Kuala_Lumpur')::date=today),
    'in_progress',count(*) filter(where j.status='in_progress'),
    'pending_material',count(*) filter(where j.status='pending_material'),
    'under_monitoring',count(*) filter(where j.status='under_monitoring'),
    'partially_completed',count(*) filter(where j.status not in ('completed','cancelled') and j.work_state='partially_completed'),
    'appointment',count(*) filter(where j.status not in ('completed','cancelled') and j.work_state='appointment'),
    'kiv',count(*) filter(where j.status not in ('completed','cancelled') and j.work_state='kiv'),
    'assigned',count(*) filter(where j.status='assigned')),
    count(*) filter(where j.status not in ('completed','cancelled')) into counts,carry
  from public.maintenance_jobs j join public.blocks b on b.id=j.block_id where b.code=any(codes);
  report:=format(E'KLGCR | %s | %s\n📅 %s\n\n📊 TODAY''S SUMMARY\nScheduled: %s\nCompleted: %s\nIn Progress: %s\nPending Material: %s\nUnder Monitoring: %s\nPartially Completed: %s\nAppointment: %s\nKIV: %s\nAssigned: %s',
    case p_type when 'morning_tasks' then '9:30 AM MORNING TASK' when 'daily_summary' then '4:50 PM DAILY SUMMARY' when 'midday_update' then '12:00 PM MIDDAY UPDATE' else '3-HOUR PROGRESS' end,
    case p_group when 'AB' then 'BLOCK A & B' when 'CD' then 'BLOCK C & D' else 'OVERALL' end,to_char(today,'DD/MM/YYYY'),
    counts->>'scheduled_today',counts->>'completed_today',counts->>'in_progress',counts->>'pending_material',counts->>'under_monitoring',counts->>'partially_completed',counts->>'appointment',counts->>'kiv',counts->>'assigned');
  if p_type='morning_tasks' then
    select string_agg(public.daily_report_job_text(j),E'\n\n' order by j.assigned_at) into section
    from public.maintenance_jobs j join public.blocks b on b.id=j.block_id where b.code=any(codes) and j.scheduled_for=today and j.status not in ('completed','cancelled');
    report:=report||E'\n\n📋 TODAY''S TASKS\n'||coalesce(section,'None');
  end if;
  foreach state in array array['completed','pending_material','under_monitoring','in_progress','assigned'] loop
    heading:=case state when 'completed' then '✅ COMPLETED TODAY' when 'pending_material' then '🔴 PENDING MATERIAL' when 'under_monitoring' then '🟡 UNDER MONITORING' when 'in_progress' then '🔵 IN PROGRESS' else '📌 ASSIGNED' end;
    select string_agg(public.daily_report_job_text(j),E'\n\n' order by j.assigned_at) into section
    from public.maintenance_jobs j join public.blocks b on b.id=j.block_id
    where b.code=any(codes) and j.status::text=state and (state<>'completed' or (j.completed_at at time zone 'Asia/Kuala_Lumpur')::date=today);
    report:=report||E'\n\n'||heading||E'\n'||coalesce(section,'None');
  end loop;
  select string_agg('• '||t.title||' | '||replace(t.status,'_',' ')||' | '||coalesce(p.full_name,'Unassigned')||case when t.notes is not null then ' | '||t.notes else '' end,E'\n' order by t.created_at) into section
    from public.admin_daily_tasks t left join public.profiles p on p.id=t.assigned_to where t.task_date=today;
  report:=report||E'\n\n📋 ADMIN TASKS\n'||coalesce(section,'None');
  select string_agg(format('• %s %s | %s %s | %s | Block %s %s | %s',i.item_code,i.description,h.qty,coalesce(i.unit,''),j.job_no,b.code,j.room_no,p.full_name),E'\n' order by h.issued_at) into section
    from public.inventory_issue_history h join public.inventory_items i on i.id=h.inventory_item_id
    join public.maintenance_jobs j on j.id=h.job_id join public.blocks b on b.id=j.block_id left join public.profiles p on p.id=h.staff_id
    where b.code=any(codes) and (h.issued_at at time zone 'Asia/Kuala_Lumpur')::date=today;
  report:=report||E'\n\n📦 MATERIAL ISSUED TODAY\n'||coalesce(section,'None');
  if p_type='daily_summary' then report:=report||E'\n\n➡️ CARRY FORWARD TO NEXT DAY: '||carry::text||' JOBS'; end if;
  insert into public.report_snapshots(report_type,report_date,block_group,payload,whatsapp_text,source)
    values(p_type,today,p_group,counts,report,'automatic');
end $$;
revoke all on function public.write_daily_report(public.report_type,text) from public;

-- Retain the inventory report implementation and its existing schedule.
alter function public.generate_automatic_report(public.report_type) rename to generate_automatic_report_legacy;
create function public.generate_automatic_report(p_type public.report_type)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_type='inventory_report' then
    perform public.generate_automatic_report_legacy(p_type);
    return;
  end if;
  perform public.write_daily_report(p_type,'AB');
  perform public.write_daily_report(p_type,'CD');
  if p_type='daily_summary' then perform public.generate_automatic_report_legacy('inventory_report'); end if;
end $$;
revoke all on function public.generate_automatic_report(public.report_type) from public;
create or replace function public.generate_overall_daily_summary()
returns void language sql security invoker set search_path='' as $$
  select public.write_daily_report('daily_summary','ALL');
$$;
revoke all on function public.generate_overall_daily_summary() from public;
select cron.schedule('klgcr-phase5-morning','30 1 * * *',$cron$select public.generate_automatic_report('morning_tasks');$cron$);
