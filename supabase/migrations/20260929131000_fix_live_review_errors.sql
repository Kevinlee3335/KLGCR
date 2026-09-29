-- Live review-error repair: only the four failures reported during Kevin's test.

-- 1) External Area complaints are valid without a Block.
alter table public.complaints alter column block_id drop not null;
alter table public.maintenance_jobs alter column block_id drop not null;

-- 2) Job transfer needs both its audit table and RPC in the live database.
create table if not exists public.job_assignment_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.maintenance_jobs(id),
  previous_staff uuid not null references public.profiles(id),
  assigned_staff uuid not null references public.profiles(id),
  changed_by uuid not null references public.profiles(id),
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.job_assignment_history enable row level security;
create index if not exists job_assignment_history_job_idx on public.job_assignment_history(job_id,created_at);
drop policy if exists "participants read transfers" on public.job_assignment_history;
create policy "participants read transfers" on public.job_assignment_history for select to authenticated
using (public.is_management() or exists(select 1 from public.maintenance_jobs j where j.id=job_id and j.assigned_to=(select auth.uid())));
drop policy if exists "admins record transfers" on public.job_assignment_history;
create policy "admins record transfers" on public.job_assignment_history for insert to authenticated
with check (public.is_admin() and changed_by=(select auth.uid()));
grant select,insert on public.job_assignment_history to authenticated;

create or replace function public.transfer_maintenance_job(p_job_id uuid,p_staff_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare j public.maintenance_jobs;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into j from public.maintenance_jobs where id=p_job_id for update;
  if not found or j.status in ('completed','cancelled') then raise exception 'Active job not found'; end if;
  if j.assigned_to=p_staff_id then raise exception 'Choose a different employee'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Transfer reason is required'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_staff_id and p.role='maintenance_staff' and p.is_active and p.deleted_at is null
    and (j.block_id is null or exists(select 1 from public.profile_blocks pb where pb.profile_id=p.id and pb.block_id=j.block_id))) then
    raise exception 'Employee is not permitted for this location';
  end if;
  insert into public.job_assignment_history(job_id,previous_staff,assigned_staff,changed_by,reason)
  values(j.id,j.assigned_to,p_staff_id,auth.uid(),trim(p_reason));
  update public.maintenance_jobs set assigned_to=p_staff_id where id=j.id;
  update public.appointments set assigned_staff=p_staff_id where job_id=j.id and status in ('pending_confirmation','confirmed','rescheduled');
end $$;
revoke all on function public.transfer_maintenance_job(uuid,uuid,text) from public;
grant execute on function public.transfer_maintenance_job(uuid,uuid,text) to authenticated;

-- 3) Daily Task assignment and progress fields used by the app.
alter table public.admin_daily_tasks add column if not exists assigned_to uuid references public.profiles(id);
alter table public.admin_daily_tasks add column if not exists accepted_at timestamptz;
alter table public.admin_daily_tasks add column if not exists started_at timestamptz;
alter table public.admin_daily_tasks add column if not exists completed_at timestamptz;
create index if not exists admin_daily_tasks_assignee_date_idx on public.admin_daily_tasks(assigned_to,task_date);
drop policy if exists "employees read assigned daily tasks" on public.admin_daily_tasks;
create policy "employees read assigned daily tasks" on public.admin_daily_tasks for select to authenticated using(assigned_to=(select auth.uid()));

create table if not exists public.daily_task_activity (
  id bigint generated always as identity primary key,
  task_id bigint not null references public.admin_daily_tasks(id) on delete cascade,
  action text not null,
  comment text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.daily_task_activity enable row level security;
create index if not exists daily_task_activity_task_created_idx on public.daily_task_activity(task_id,created_at);
drop policy if exists "management reads daily task activity" on public.daily_task_activity;
create policy "management reads daily task activity" on public.daily_task_activity for select to authenticated
using (public.is_management() or exists(select 1 from public.admin_daily_tasks t where t.id=task_id and t.assigned_to=(select auth.uid())));
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

-- 4) Allow the exact status update path used by Daily Task pages.
create or replace function public.admin_update_daily_task(p_id bigint,p_status text,p_comment text default null)
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

create or replace function public.update_assigned_daily_task(p_id bigint,p_status text,p_comment text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_action text;
begin
  if auth.uid() is null or p_status not in ('accepted','in_progress','completed','kiv') then raise exception 'Invalid request'; end if;
  update public.admin_daily_tasks set status=p_status,updated_at=now(),accepted_at=case when p_status='accepted' then coalesce(accepted_at,now()) else accepted_at end,started_at=case when p_status='in_progress' then coalesce(started_at,now()) else started_at end,completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end where id=p_id and assigned_to=auth.uid();
  if not found then raise exception 'Assigned task not found'; end if;
  v_action := case p_status when 'accepted' then 'Task Accepted' when 'in_progress' then 'In Progress' when 'completed' then 'Completed' else 'KIV' end;
  insert into public.daily_task_activity(task_id,action,comment,actor_id) values(p_id,v_action,nullif(trim(p_comment),''),auth.uid());
end $$;
revoke all on function public.update_assigned_daily_task(bigint,text,text) from public;
grant execute on function public.update_assigned_daily_task(bigint,text,text) to authenticated;
