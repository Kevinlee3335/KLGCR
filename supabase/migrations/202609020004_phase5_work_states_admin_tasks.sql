-- KLGCR Phase 5: additive operational labels and Admin Tasks.
alter table public.maintenance_jobs
  add column work_state text not null default 'standard'
  check (work_state in ('standard','partially_completed','appointment','kiv'));

create index maintenance_jobs_work_state_idx on public.maintenance_jobs(work_state, scheduled_for);

create table public.admin_daily_tasks (
  id bigint generated always as identity primary key,
  task_date date not null default ((now() at time zone 'Asia/Kuala_Lumpur')::date),
  title text not null check (length(trim(title)) > 0),
  notes text,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','kiv')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index admin_daily_tasks_date_idx on public.admin_daily_tasks(task_date desc,status);
alter table public.admin_daily_tasks enable row level security;
create policy "management reads admin daily tasks" on public.admin_daily_tasks for select to authenticated using (public.is_management());
create policy "admins insert admin daily tasks" on public.admin_daily_tasks for insert to authenticated with check (public.is_admin() and created_by=auth.uid());
create policy "admins update admin daily tasks" on public.admin_daily_tasks for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete admin daily tasks" on public.admin_daily_tasks for delete to authenticated using (public.is_admin());
grant select,insert,update,delete on public.admin_daily_tasks to authenticated;
grant usage,select on sequence public.admin_daily_tasks_id_seq to authenticated;

create function public.set_job_work_state(p_job_id uuid,p_work_state text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_work_state not in ('standard','partially_completed','appointment','kiv') then raise exception 'Invalid work state'; end if;
  update public.maintenance_jobs set work_state=p_work_state,updated_at=now() where id=p_job_id;
  if not found then raise exception 'Job not found'; end if;
end $$;
revoke all on function public.set_job_work_state(uuid,text) from public;
grant execute on function public.set_job_work_state(uuid,text) to authenticated;
