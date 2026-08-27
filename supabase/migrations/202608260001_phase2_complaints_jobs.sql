-- KLGCR V1 Phase 2: complaint review and maintenance assignment workflow.
create type public.complaint_status as enum ('new','under_review','assigned','rejected','closed');
create type public.complaint_priority as enum ('low','normal','high','urgent');
create type public.complaint_source as enum ('google_form','manual','cleaning','flex','other');
create type public.job_status as enum ('assigned','in_progress','pending_material','under_monitoring','completed','cancelled');

create sequence public.complaint_number_seq;
create sequence public.job_number_seq;

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  complaint_no text not null unique default ('CMP-' || extract(year from current_date)::text || '-' || lpad(nextval('public.complaint_number_seq')::text,4,'0')),
  source public.complaint_source not null default 'manual',
  block_id smallint not null references public.blocks(id) on delete restrict,
  room_no text not null check (length(trim(room_no)) > 0),
  complainant_name text,
  complainant_contact text,
  category text not null check (length(trim(category)) > 0),
  description text not null check (length(trim(description)) > 0),
  priority public.complaint_priority not null default 'normal',
  status public.complaint_status not null default 'new',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  assigned_to uuid references public.profiles(id) on delete restrict,
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.maintenance_jobs (
  id uuid primary key default gen_random_uuid(),
  job_no text not null unique default ('JOB-' || extract(year from current_date)::text || '-' || lpad(nextval('public.job_number_seq')::text,4,'0')),
  complaint_id uuid not null unique references public.complaints(id) on delete restrict,
  block_id smallint not null references public.blocks(id) on delete restrict,
  room_no text not null,
  category text not null,
  description text not null,
  priority public.complaint_priority not null,
  assigned_to uuid not null references public.profiles(id) on delete restrict,
  status public.job_status not null default 'assigned',
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index complaints_status_idx on public.complaints(status, submitted_at desc);
create index maintenance_jobs_assignee_idx on public.maintenance_jobs(assigned_to, status, assigned_at desc);
create trigger complaints_updated_at before update on public.complaints for each row execute function public.set_updated_at();
create trigger maintenance_jobs_updated_at before update on public.maintenance_jobs for each row execute function public.set_updated_at();

alter table public.complaints enable row level security;
alter table public.maintenance_jobs enable row level security;

create policy "management reads complaints" on public.complaints for select to authenticated using (public.is_management());
create policy "admins create complaints" on public.complaints for insert to authenticated with check (public.is_admin());
create policy "admins update complaints" on public.complaints for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "management reads all jobs; staff reads assigned allowed jobs" on public.maintenance_jobs for select to authenticated using (
  public.is_management() or (
    assigned_to = auth.uid() and public.current_role() = 'maintenance_staff' and
    exists (select 1 from public.profile_blocks pb where pb.profile_id = auth.uid() and pb.block_id = maintenance_jobs.block_id)
  )
);
create policy "admins create jobs" on public.maintenance_jobs for insert to authenticated with check (public.is_admin());
create policy "admins update jobs" on public.maintenance_jobs for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Atomically verifies block access, creates exactly one job, and updates its complaint.
create function public.assign_complaint(p_complaint_id uuid, p_assigned_to uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_complaint public.complaints; v_job_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into v_complaint from public.complaints where id = p_complaint_id for update;
  if not found then raise exception 'Complaint not found'; end if;
  if v_complaint.status in ('assigned','rejected','closed') then raise exception 'Complaint cannot be assigned'; end if;
  if not exists (
    select 1 from public.profiles p join public.profile_blocks pb on pb.profile_id=p.id
    where p.id=p_assigned_to and p.role='maintenance_staff' and p.is_active and p.deleted_at is null and pb.block_id=v_complaint.block_id
  ) then raise exception 'Staff member is not active or allowed for this block'; end if;
  insert into public.maintenance_jobs(complaint_id,block_id,room_no,category,description,priority,assigned_to)
  values(v_complaint.id,v_complaint.block_id,v_complaint.room_no,v_complaint.category,v_complaint.description,v_complaint.priority,p_assigned_to)
  returning id into v_job_id;
  update public.complaints set status='assigned',assigned_to=p_assigned_to,assigned_at=now(),reviewed_by=auth.uid(),reviewed_at=now() where id=p_complaint_id;
  return v_job_id;
end $$;

-- Staff get one deliberately narrow mutation instead of table UPDATE privileges.
create function public.start_assigned_job(p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  update public.maintenance_jobs j set status='in_progress',started_at=coalesce(started_at,now())
  where j.id=p_job_id and j.assigned_to=auth.uid() and j.status='assigned'
    and exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id);
  if not found then raise exception 'Assigned job not found or cannot be started'; end if;
end $$;

revoke all on function public.assign_complaint(uuid,uuid) from public;
revoke all on function public.start_assigned_job(uuid) from public;
grant execute on function public.assign_complaint(uuid,uuid), public.start_assigned_job(uuid) to authenticated;
grant select on public.complaints, public.maintenance_jobs to authenticated;
grant insert,update on public.complaints, public.maintenance_jobs to authenticated;
