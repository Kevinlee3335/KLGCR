-- KLGCR Enterprise CMMS Schema V2.
-- Additive only: preserves all V1 columns, RPCs, policies and workflows.

alter type public.job_status add value if not exists 'accepted';
alter type public.job_status add value if not exists 'paused';
alter type public.job_status add value if not exists 'verified';
alter type public.job_status add value if not exists 'closed';
alter type public.job_status add value if not exists 'reopened';
alter type public.material_request_status add value if not exists 'cancelled';
alter type public.material_request_status add value if not exists 'partially_approved';

alter table public.maintenance_jobs
  add column if not exists current_stage text not null default 'assigned',
  add column if not exists progress smallint not null default 0 check (progress between 0 and 100),
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid references public.profiles(id) on delete restrict,
  add column if not exists paused_at timestamptz,
  add column if not exists paused_by uuid references public.profiles(id) on delete restrict,
  add column if not exists pause_reason text,
  add column if not exists resumed_at timestamptz,
  add column if not exists resumed_by uuid references public.profiles(id) on delete restrict,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id) on delete restrict,
  add column if not exists verification_remark text,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references public.profiles(id) on delete restrict,
  add column if not exists closure_remark text,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references public.profiles(id) on delete restrict,
  add column if not exists reopen_reason text,
  add column if not exists reopen_previous_status public.job_status,
  add column if not exists monitoring_ended_at timestamptz;

update public.maintenance_jobs
set current_stage = status::text,
    progress = case status
      when 'assigned' then 0 when 'in_progress' then 50
      when 'pending_material' then 50 when 'under_monitoring' then 75
      when 'completed' then 75 else 0 end
where current_stage = 'assigned' and progress = 0;

create index if not exists maintenance_jobs_lifecycle_reporting_idx on public.maintenance_jobs(status, created_at desc);
create index if not exists maintenance_jobs_completed_reporting_idx on public.maintenance_jobs(completed_at desc) where completed_at is not null;
create index if not exists maintenance_jobs_verified_reporting_idx on public.maintenance_jobs(verified_at desc) where verified_at is not null;
create index if not exists maintenance_jobs_closed_reporting_idx on public.maintenance_jobs(closed_at desc) where closed_at is not null;

create or replace function public.sync_job_lifecycle_aggregate()
returns trigger language plpgsql set search_path = '' as $$
declare v_status text := new.status::text;
begin
  new.current_stage := v_status;
  new.progress := case v_status
    when 'assigned' then 0 when 'accepted' then 25
    when 'in_progress' then 50 when 'paused' then 50
    when 'pending_material' then 50 when 'under_monitoring' then 75
    when 'completed' then 75 when 'verified' then 100
    when 'closed' then 100 when 'reopened' then 25 else new.progress end;
  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      if v_status = 'accepted' then new.accepted_at := coalesce(new.accepted_at,now()); new.accepted_by := coalesce(new.accepted_by,auth.uid()); end if;
      if v_status = 'paused' then new.paused_at := coalesce(new.paused_at,now()); new.paused_by := coalesce(new.paused_by,auth.uid()); end if;
      if v_status = 'in_progress' and old.status::text = 'paused' then new.resumed_at := now(); new.resumed_by := auth.uid(); end if;
      if v_status = 'verified' then new.verified_at := coalesce(new.verified_at,now()); new.verified_by := coalesce(new.verified_by,auth.uid()); end if;
      if v_status = 'closed' then new.closed_at := coalesce(new.closed_at,now()); new.closed_by := coalesce(new.closed_by,auth.uid()); end if;
      if v_status = 'reopened' then new.reopened_at := now(); new.reopened_by := auth.uid(); new.reopen_previous_status := old.status; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists maintenance_jobs_lifecycle_aggregate on public.maintenance_jobs;
create trigger maintenance_jobs_lifecycle_aggregate before insert or update of status on public.maintenance_jobs
for each row execute function public.sync_job_lifecycle_aggregate();

alter table public.complaints
  add column if not exists internal_remark text,
  add column if not exists resolution text;

alter table public.job_status_history
  add column if not exists action text,
  add column if not exists reason text,
  add column if not exists progress smallint check (progress between 0 and 100);

update public.job_status_history
set action = new_status::text
where action is null;

alter table public.material_requests
  add column if not exists requested_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete restrict,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references public.profiles(id) on delete restrict,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete restrict,
  add column if not exists cancellation_reason text,
  add column if not exists internal_notes text;

-- Warehouse master-data fields are nullable so existing inventory records remain valid.
alter table public.inventory_items
  add column if not exists brand text,
  add column if not exists supplier text,
  add column if not exists storage_location text,
  add column if not exists barcode text,
  add column if not exists minimum_stock numeric(12,2) check (minimum_stock is null or minimum_stock >= 0),
  add column if not exists maximum_stock numeric(12,2) check (maximum_stock is null or maximum_stock >= 0),
  add column if not exists supplier_contact_person text,
  add column if not exists supplier_phone text,
  add column if not exists supplier_email text,
  add column if not exists supplier_lead_time_days integer check (supplier_lead_time_days is null or supplier_lead_time_days >= 0);
create unique index if not exists inventory_items_barcode_uidx on public.inventory_items(barcode) where barcode is not null;

update public.material_requests
set requested_at = created_at,
    approved_at = case when status in ('approved','issued') then reviewed_at else null end,
    approved_by = case when status in ('approved','issued') then reviewed_by else null end,
    rejected_at = case when status = 'rejected' then reviewed_at else null end,
    rejected_by = case when status = 'rejected' then reviewed_by else null end
where requested_at is null;

alter table public.material_requests alter column requested_at set default now();
alter table public.material_requests alter column requested_at set not null;

do $$ begin
  create type public.appointment_status as enum ('scheduled','confirmed','completed','cancelled','no_access');
exception when duplicate_object then null;
end $$;
create table if not exists public.job_appointments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.maintenance_jobs(id) on delete restrict,
  appointment_date date not null,
  appointment_time time,
  reason text not null check (length(trim(reason)) > 0),
  status public.appointment_status not null default 'scheduled',
  created_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_appointments_job_date_idx on public.job_appointments(job_id, appointment_date desc);
drop trigger if exists job_appointments_updated_at on public.job_appointments;
create trigger job_appointments_updated_at before update on public.job_appointments for each row execute function public.set_updated_at();

do $$ begin
  create type public.job_photo_type as enum ('complaint','before_repair','progress','after_repair');
exception when duplicate_object then null;
end $$;
create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.maintenance_jobs(id) on delete restrict,
  photo_type public.job_photo_type not null,
  storage_path text not null check (length(trim(storage_path)) > 0),
  caption text,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  captured_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists job_photos_job_type_idx on public.job_photos(job_id, photo_type, created_at);

do $$ begin
  create type public.job_note_type as enum ('admin','maintenance','monitoring');
exception when duplicate_object then null;
end $$;
create table if not exists public.job_internal_notes (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.maintenance_jobs(id) on delete restrict,
  note_type public.job_note_type not null,
  note text not null check (length(trim(note)) > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists job_internal_notes_job_idx on public.job_internal_notes(job_id, created_at desc);

do $$ begin
  create type public.inventory_movement_type as enum ('in','out','adjustment');
exception when duplicate_object then null;
end $$;
create sequence if not exists public.inventory_movement_number_seq;
create table if not exists public.inventory_movements (
  id bigint generated always as identity primary key,
  reference_number text not null unique default ('MOV-' || lpad(nextval('public.inventory_movement_number_seq')::text, 8, '0')),
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  job_id uuid references public.maintenance_jobs(id) on delete restrict,
  material_request_id uuid references public.material_requests(id) on delete restrict,
  movement_type public.inventory_movement_type not null,
  quantity numeric(12,2) not null check (quantity > 0),
  balance_before numeric(12,2),
  balance_after numeric(12,2),
  supplier text,
  issued_by uuid references public.profiles(id) on delete restrict,
  received_by uuid references public.profiles(id) on delete restrict,
  source_type text not null,
  source_id text,
  remark text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(source_type, source_id)
);
create index if not exists inventory_movements_item_date_idx on public.inventory_movements(inventory_item_id, occurred_at desc);
create index if not exists inventory_movements_job_idx on public.inventory_movements(job_id, occurred_at desc) where job_id is not null;
create index if not exists inventory_movements_request_idx on public.inventory_movements(material_request_id, occurred_at desc) where material_request_id is not null;

create table if not exists public.audit_trail (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id uuid references public.profiles(id) on delete restrict,
  module text not null,
  record_type text not null,
  record_id text not null,
  record_number text,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  remark text
);
create index if not exists audit_trail_record_idx on public.audit_trail(record_type, record_id, occurred_at desc);
create index if not exists audit_trail_module_date_idx on public.audit_trail(module, occurred_at desc);
create index if not exists audit_trail_user_date_idx on public.audit_trail(user_id, occurred_at desc) where user_id is not null;

create or replace function public.capture_audit_trail()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_number text;
begin
  v_old := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  v_row := coalesce(v_new, v_old);
  v_number := case when array_length(tg_argv,1) > 1 then v_row ->> tg_argv[1] else null end;
  insert into public.audit_trail(user_id,module,record_type,record_id,record_number,action,old_value,new_value)
  values(auth.uid(),tg_argv[0],tg_table_name,v_row->>'id',v_number,lower(tg_op),v_old,v_new);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists maintenance_jobs_audit on public.maintenance_jobs;
create trigger maintenance_jobs_audit after insert or update or delete on public.maintenance_jobs
for each row execute function public.capture_audit_trail('maintenance','job_no');
drop trigger if exists complaints_audit on public.complaints;
create trigger complaints_audit after insert or update or delete on public.complaints
for each row execute function public.capture_audit_trail('complaints','complaint_no');
drop trigger if exists material_requests_audit on public.material_requests;
create trigger material_requests_audit after insert or update or delete on public.material_requests
for each row execute function public.capture_audit_trail('materials','request_no');
drop trigger if exists inventory_items_audit on public.inventory_items;
create trigger inventory_items_audit after insert or update or delete on public.inventory_items
for each row execute function public.capture_audit_trail('inventory','item_code');
drop trigger if exists job_status_history_audit on public.job_status_history;
create trigger job_status_history_audit after insert on public.job_status_history
for each row execute function public.capture_audit_trail('maintenance');
drop trigger if exists job_appointments_audit on public.job_appointments;
create trigger job_appointments_audit after insert or update or delete on public.job_appointments
for each row execute function public.capture_audit_trail('maintenance');
drop trigger if exists job_photos_audit on public.job_photos;
create trigger job_photos_audit after insert or delete on public.job_photos
for each row execute function public.capture_audit_trail('maintenance');
drop trigger if exists job_internal_notes_audit on public.job_internal_notes;
create trigger job_internal_notes_audit after insert on public.job_internal_notes
for each row execute function public.capture_audit_trail('maintenance');
drop trigger if exists inventory_movements_audit on public.inventory_movements;
create trigger inventory_movements_audit after insert on public.inventory_movements
for each row execute function public.capture_audit_trail('inventory','reference_number');

create or replace function public.sync_material_request_lifecycle()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.requested_at := coalesce(new.requested_at,new.created_at,now());
  if tg_op = 'UPDATE' then
    if new.status::text in ('approved','partially_approved') and old.status is distinct from new.status then
      new.approved_at := coalesce(new.approved_at,new.reviewed_at,now());
      new.approved_by := coalesce(new.approved_by,new.reviewed_by,auth.uid());
    elsif new.status = 'rejected' and old.status is distinct from new.status then
      new.rejected_at := coalesce(new.rejected_at,new.reviewed_at,now());
      new.rejected_by := coalesce(new.rejected_by,new.reviewed_by,auth.uid());
    elsif new.status::text = 'cancelled' and old.status is distinct from new.status then
      new.cancelled_at := coalesce(new.cancelled_at,now());
      new.cancelled_by := coalesce(new.cancelled_by,auth.uid());
    end if;
  end if;
  return new;
end $$;
drop trigger if exists material_requests_lifecycle on public.material_requests;
create trigger material_requests_lifecycle before insert or update on public.material_requests
for each row execute function public.sync_material_request_lifecycle();

create or replace function public.ledger_inventory_issue()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inventory_movements(inventory_item_id,job_id,material_request_id,movement_type,quantity,balance_before,balance_after,issued_by,received_by,source_type,source_id,occurred_at)
  values(new.inventory_item_id,new.job_id,new.request_id,'out',new.qty,new.balance_before,new.balance_after,new.issued_by,new.staff_id,'issue',new.id::text,new.issued_at)
  on conflict(source_type,source_id) do nothing;
  return new;
end $$;
drop trigger if exists inventory_issue_ledger on public.inventory_issue_history;
create trigger inventory_issue_ledger after insert on public.inventory_issue_history
for each row execute function public.ledger_inventory_issue();

create or replace function public.ledger_inventory_adjustment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inventory_movements(inventory_item_id,movement_type,quantity,balance_before,balance_after,received_by,source_type,source_id,remark,occurred_at)
  values(new.inventory_item_id,case when new.adjustment_type='stock_in' then 'in'::public.inventory_movement_type else 'adjustment'::public.inventory_movement_type end,new.qty,new.balance_before,new.balance_after,new.adjusted_by,'adjustment',new.id::text,new.note,new.adjusted_at)
  on conflict(source_type,source_id) do nothing;
  return new;
end $$;
drop trigger if exists inventory_adjustment_ledger on public.inventory_adjustment_history;
create trigger inventory_adjustment_ledger after insert on public.inventory_adjustment_history
for each row execute function public.ledger_inventory_adjustment();

insert into public.inventory_movements(inventory_item_id,job_id,material_request_id,movement_type,quantity,balance_before,balance_after,issued_by,received_by,source_type,source_id,occurred_at)
select inventory_item_id,job_id,request_id,'out',qty,balance_before,balance_after,issued_by,staff_id,'issue',id::text,issued_at
from public.inventory_issue_history on conflict(source_type,source_id) do nothing;
insert into public.inventory_movements(inventory_item_id,movement_type,quantity,balance_before,balance_after,received_by,source_type,source_id,remark,occurred_at)
select inventory_item_id,case when adjustment_type='stock_in' then 'in'::public.inventory_movement_type else 'adjustment'::public.inventory_movement_type end,qty,balance_before,balance_after,adjusted_by,'adjustment',id::text,note,adjusted_at
from public.inventory_adjustment_history on conflict(source_type,source_id) do nothing;

alter table public.job_appointments enable row level security;
alter table public.job_photos enable row level security;
alter table public.job_internal_notes enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.audit_trail enable row level security;

drop policy if exists "management reads appointments; assigned staff reads own" on public.job_appointments;
create policy "management reads appointments; assigned staff reads own" on public.job_appointments for select to authenticated using
(public.is_management() or (public.current_role()='maintenance_staff' and exists(select 1 from public.maintenance_jobs j join public.profile_blocks pb on pb.profile_id=auth.uid() and pb.block_id=j.block_id where j.id=job_id and j.assigned_to=auth.uid())));
drop policy if exists "management reads photos; assigned staff reads own" on public.job_photos;
create policy "management reads photos; assigned staff reads own" on public.job_photos for select to authenticated using
(public.is_management() or (public.current_role()='maintenance_staff' and exists(select 1 from public.maintenance_jobs j join public.profile_blocks pb on pb.profile_id=auth.uid() and pb.block_id=j.block_id where j.id=job_id and j.assigned_to=auth.uid())));
drop policy if exists "internal users read permitted job notes" on public.job_internal_notes;
create policy "internal users read permitted job notes" on public.job_internal_notes for select to authenticated using
(public.is_management() or (public.current_role()='maintenance_staff' and exists(select 1 from public.maintenance_jobs j join public.profile_blocks pb on pb.profile_id=auth.uid() and pb.block_id=j.block_id where j.id=job_id and j.assigned_to=auth.uid())));
drop policy if exists "management reads inventory movements" on public.inventory_movements;
create policy "management reads inventory movements" on public.inventory_movements for select to authenticated using (public.is_management());
drop policy if exists "management reads audit trail" on public.audit_trail;
create policy "management reads audit trail" on public.audit_trail for select to authenticated using (public.is_admin());

drop policy if exists "admins manage appointments" on public.job_appointments;
create policy "admins manage appointments" on public.job_appointments for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "internal users add own job photos" on public.job_photos;
create policy "internal users add own job photos" on public.job_photos for insert to authenticated with check
(uploaded_by=auth.uid() and (public.is_admin() or (public.current_role()='maintenance_staff' and exists(select 1 from public.maintenance_jobs j join public.profile_blocks pb on pb.profile_id=auth.uid() and pb.block_id=j.block_id where j.id=job_id and j.assigned_to=auth.uid()))));
drop policy if exists "internal users add own job notes" on public.job_internal_notes;
create policy "internal users add own job notes" on public.job_internal_notes for insert to authenticated with check
(created_by=auth.uid() and (public.is_admin() or (public.current_role()='maintenance_staff' and exists(select 1 from public.maintenance_jobs j join public.profile_blocks pb on pb.profile_id=auth.uid() and pb.block_id=j.block_id where j.id=job_id and j.assigned_to=auth.uid()))));

grant select,insert,update,delete on public.job_appointments to authenticated;
grant select,insert on public.job_photos,public.job_internal_notes to authenticated;
grant select on public.inventory_movements,public.audit_trail to authenticated;
grant usage,select on sequence public.job_internal_notes_id_seq to authenticated;
revoke insert,update,delete on public.inventory_movements,public.audit_trail from authenticated;

create or replace view public.cmms_job_reporting
with (security_invoker = true)
as
select j.id,j.job_no,j.complaint_id,j.block_id,j.assigned_to,j.category,j.priority,j.status,j.current_stage,j.progress,
  j.created_at,j.assigned_at,j.accepted_at,j.started_at,j.paused_at,j.resumed_at,j.completed_at,j.verified_at,j.closed_at,j.reopened_at,
  extract(epoch from (coalesce(j.started_at,now())-j.assigned_at))/60 as response_minutes,
  case when j.started_at is not null then extract(epoch from (coalesce(j.completed_at,now())-j.started_at))/60 end as working_minutes,
  extract(epoch from (coalesce(j.closed_at,j.completed_at,now())-j.created_at))/60 as total_minutes
from public.maintenance_jobs j;
grant select on public.cmms_job_reporting to authenticated;


-- V2 compatibility replacements for existing scheduling and reporting RPCs.
create or replace function public.schedule_job(p_job_id uuid,p_date date)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.maintenance_jobs set scheduled_for=p_date where id=p_job_id and status::text not in ('completed','verified','closed','cancelled');
  if not found then raise exception 'Active job not found'; end if;
end $$;

create or replace function public.admin_dashboard_counts()
returns table (new_complaints bigint,today_tasks bigint,completed_today bigint,outstanding bigint)
language sql stable security invoker set search_path=public as $$
  select
    (select count(*) from public.complaints where status='new')::bigint,
    (select count(*) from public.maintenance_jobs where scheduled_for=(now() at time zone 'Asia/Kuala_Lumpur')::date and status::text not in ('completed','verified','closed','cancelled'))::bigint,
    (select count(*) from public.maintenance_jobs where status::text in ('completed','verified','closed') and (completed_at at time zone 'Asia/Kuala_Lumpur')::date=(now() at time zone 'Asia/Kuala_Lumpur')::date)::bigint,
    (select count(*) from public.maintenance_jobs where status::text in ('assigned','accepted','in_progress','paused','pending_material','under_monitoring','reopened'))::bigint;
$$;

create or replace function public.review_material_request_quantities(p_request_id uuid,p_items jsonb,p_remark text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_item jsonb; v_id uuid; v_seen uuid[] := array[]::uuid[]; v_requested numeric; v_approved numeric; v_count integer; v_partial boolean := false; v_positive boolean := false;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' then raise exception 'Approved quantities are required'; end if;
  perform 1 from public.material_requests where id=p_request_id and status='pending' for update;
  if not found then raise exception 'Pending request not found'; end if;
  select count(*) into v_count from public.material_request_items where request_id=p_request_id;
  if v_count=0 or jsonb_array_length(p_items)<>v_count then raise exception 'Every request item requires an approved quantity'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id := (v_item->>'item_id')::uuid;
    if v_id=any(v_seen) then raise exception 'Duplicate request item'; end if;
    v_seen:=array_append(v_seen,v_id);
    v_approved := (v_item->>'approved_qty')::numeric;
    if v_approved is null then raise exception 'Approved quantity is required'; end if;
    select requested_qty into v_requested from public.material_request_items where id=v_id and request_id=p_request_id for update;
    if not found then raise exception 'Request item not found'; end if;
    if v_approved<0 or v_approved>v_requested then raise exception 'Approved quantity must be between zero and requested quantity'; end if;
    update public.material_request_items set approved_qty=v_approved where id=v_id;
    if v_approved<v_requested then v_partial:=true; end if;
    if v_approved>0 then v_positive:=true; end if;
  end loop;
  if not v_positive then raise exception 'At least one item must be approved'; end if;
  update public.material_requests set status=case when v_partial then 'partially_approved'::public.material_request_status else 'approved'::public.material_request_status end,
    reviewed_by=auth.uid(),reviewed_at=now(),approved_by=auth.uid(),approved_at=now(),rejection_reason=null,internal_notes=nullif(trim(p_remark),'')
  where id=p_request_id;
end $$;
revoke all on function public.review_material_request_quantities(uuid,jsonb,text) from public;
grant execute on function public.review_material_request_quantities(uuid,jsonb,text) to authenticated;

create or replace function public.cancel_material_request(p_request_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Cancellation reason is required'; end if;
  update public.material_requests set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=trim(p_reason)
  where id=p_request_id and status::text in ('pending','approved','partially_approved');
  if not found then raise exception 'Request cannot be cancelled'; end if;
end $$;
revoke all on function public.cancel_material_request(uuid,text) from public;
grant execute on function public.cancel_material_request(uuid,text) to authenticated;

create or replace function public.issue_material_request(p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r record; v_job uuid; v_staff uuid; v_before numeric;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select job_id,requested_by into v_job,v_staff from public.material_requests where id=p_request_id and status::text in ('approved','partially_approved') for update;
  if not found then raise exception 'Approved request not found'; end if;
  for r in select * from public.material_request_items where request_id=p_request_id and coalesce(approved_qty,0)>0 loop
    select balance_qty into v_before from public.inventory_items where id=r.inventory_item_id for update;
    if v_before<r.approved_qty then raise exception 'Insufficient inventory for item %',r.inventory_item_id; end if;
    update public.inventory_items set balance_qty=balance_qty-r.approved_qty where id=r.inventory_item_id;
    update public.material_request_items set issued_qty=r.approved_qty where id=r.id;
    insert into public.inventory_issue_history(request_id,job_id,inventory_item_id,staff_id,qty,balance_before,balance_after,issued_by) values(p_request_id,v_job,r.inventory_item_id,v_staff,r.approved_qty,v_before,v_before-r.approved_qty,auth.uid());
  end loop;
  update public.material_requests set status='issued',issued_by=auth.uid(),issued_at=now() where id=p_request_id;
end $$;

drop trigger if exists material_request_items_audit on public.material_request_items;
create trigger material_request_items_audit after update on public.material_request_items
for each row execute function public.capture_audit_trail('materials');

create or replace function public.generate_automatic_report(p_type public.report_type)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_group text; v_codes text[]; v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_scheduled integer; v_completed integer; v_in_progress integer; v_pending integer; v_monitoring integer; v_assigned integer;
  v_partial integer; v_appointment integer; v_kiv integer;
  v_list text; v_admin text; v_material text; v_text text; v_payload jsonb;
begin
  if p_type='inventory_report' then
    select jsonb_build_object('total',count(*),'out_of_stock',count(*) filter(where balance_qty=0),'near_reorder',count(*) filter(where balance_qty>0 and balance_qty<=reorder_level)) into v_payload from public.inventory_items where is_active;
    select coalesce(string_agg(format('- %s %s: %s %s',item_code,description,balance_qty,coalesce(unit,'')),E'\n' order by item_code),'None') into v_list from public.inventory_items where is_active and (balance_qty=0 or (balance_qty>0 and balance_qty<=reorder_level));
    v_text:=format('KLGCR | Inventory Report\nDate: %s\nTotal Items: %s\nOut of Stock: %s\nNear Reorder: %s\n\nItems Requiring Attention:\n%s',v_today,v_payload->>'total',v_payload->>'out_of_stock',v_payload->>'near_reorder',v_list);
    insert into public.report_snapshots(report_type,report_date,block_group,payload,whatsapp_text,source) values('inventory_report',v_today,'ALL',v_payload,v_text,'automatic'); return;
  end if;

  select coalesce(string_agg(format('- %s | %s%s',title,replace(status,'_',' '),case when notes is null or trim(notes)='' then '' else ' | '||notes end),E'\n' order by created_at),'None') into v_admin from public.admin_daily_tasks where task_date=v_today;

  foreach v_group in array array['AB','CD'] loop
    v_codes:=case when v_group='AB' then array['A','B']::text[] else array['C','D']::text[] end;
    select count(*) filter(where j.scheduled_for=v_today and j.status not in ('completed','verified','closed','cancelled')),count(*) filter(where j.status in ('completed','verified','closed') and (j.completed_at at time zone 'Asia/Kuala_Lumpur')::date=v_today),count(*) filter(where j.status='in_progress'),count(*) filter(where j.status='pending_material'),count(*) filter(where j.status='under_monitoring'),count(*) filter(where j.status='assigned'),count(*) filter(where j.status not in ('completed','verified','closed','cancelled') and j.work_state='partially_completed'),count(*) filter(where j.status not in ('completed','verified','closed','cancelled') and j.work_state='appointment'),count(*) filter(where j.status not in ('completed','verified','closed','cancelled') and j.work_state='kiv') into v_scheduled,v_completed,v_in_progress,v_pending,v_monitoring,v_assigned,v_partial,v_appointment,v_kiv from public.maintenance_jobs j join public.blocks b on b.id=j.block_id where b.code=any(v_codes);

    select coalesce(string_agg(format('- %s | Block %s %s | %s | %s%s | %s',j.job_no,b.code,j.room_no,j.category,replace(j.status::text,'_',' '),case when j.work_state='standard' then '' else ' | '||replace(j.work_state,'_',' ') end,p.full_name),E'\n' order by j.assigned_at),'None') into v_list from public.maintenance_jobs j join public.blocks b on b.id=j.block_id join public.profiles p on p.id=j.assigned_to where b.code=any(v_codes) and ((p_type='morning_tasks' and j.scheduled_for=v_today and j.status not in ('completed','verified','closed','cancelled')) or (p_type='daily_summary' and j.status in ('completed','verified','closed') and (j.completed_at at time zone 'Asia/Kuala_Lumpur')::date=v_today) or (p_type in ('midday_update','progress_snapshot') and j.status not in ('completed','verified','closed','cancelled')));

    select coalesce(string_agg(format('- %s %s | %s %s | %s | Block %s %s | %s',i.item_code,i.description,h.qty,coalesce(i.unit,''),j.job_no,b.code,j.room_no,p.full_name),E'\n' order by h.issued_at),'None') into v_material from public.inventory_issue_history h join public.inventory_items i on i.id=h.inventory_item_id join public.maintenance_jobs j on j.id=h.job_id join public.blocks b on b.id=j.block_id join public.profiles p on p.id=h.staff_id where b.code=any(v_codes) and (h.issued_at at time zone 'Asia/Kuala_Lumpur')::date=v_today;

    v_payload:=jsonb_build_object('scheduled_today',v_scheduled,'completed_today',v_completed,'in_progress',v_in_progress,'pending_material',v_pending,'under_monitoring',v_monitoring,'partially_completed',v_partial,'appointment',v_appointment,'kiv',v_kiv,'assigned',v_assigned);
    v_text:=format('KLGCR | %s | %s\nDate: %s\nScheduled Today: %s\nCompleted Today: %s\nIn Progress: %s\nPending Material: %s\nUnder Monitoring: %s\nPartially Completed: %s\nAppointment: %s\nKIV: %s\nAssigned: %s\n\n%s\n\nAdmin Tasks:\n%s%s',case p_type when 'morning_tasks' then '9:00 AM Morning Daily Task' when 'midday_update' then '12:00 PM Midday Update' when 'daily_summary' then '4:50 PM Daily Summary' else '3-Hour Progress Snapshot' end,v_group,v_today,v_scheduled,v_completed,v_in_progress,v_pending,v_monitoring,v_partial,v_appointment,v_kiv,v_assigned,v_list,v_admin,case when p_type='morning_tasks' then '' else E'\n\nMaterial Issued Today:\n'||v_material end);
    insert into public.report_snapshots(report_type,report_date,block_group,payload,whatsapp_text,source) values(p_type,v_today,v_group,v_payload,v_text,'automatic');
  end loop;
  if p_type='daily_summary' then perform public.generate_automatic_report('inventory_report'); end if;
end $$;

create or replace function public.generate_overall_daily_summary()
returns void language plpgsql security definer set search_path='' as $$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date; v_scheduled integer; v_completed integer; v_in_progress integer; v_pending integer; v_monitoring integer; v_assigned integer; v_partial integer; v_appointment integer; v_kiv integer; v_list text; v_admin text; v_material text; v_text text; v_payload jsonb;
begin
  select count(*) filter(where scheduled_for=v_today and status not in ('completed','verified','closed','cancelled')),count(*) filter(where status in ('completed','verified','closed') and (completed_at at time zone 'Asia/Kuala_Lumpur')::date=v_today),count(*) filter(where status='in_progress'),count(*) filter(where status='pending_material'),count(*) filter(where status='under_monitoring'),count(*) filter(where status='assigned'),count(*) filter(where status not in ('completed','verified','closed','cancelled') and work_state='partially_completed'),count(*) filter(where status not in ('completed','verified','closed','cancelled') and work_state='appointment'),count(*) filter(where status not in ('completed','verified','closed','cancelled') and work_state='kiv') into v_scheduled,v_completed,v_in_progress,v_pending,v_monitoring,v_assigned,v_partial,v_appointment,v_kiv from public.maintenance_jobs;
  select coalesce(string_agg(format('- %s | Block %s %s | %s | %s%s | %s',j.job_no,b.code,j.room_no,j.category,replace(j.status::text,'_',' '),case when j.work_state='standard' then '' else ' | '||replace(j.work_state,'_',' ') end,p.full_name),E'\n' order by j.assigned_at),'None') into v_list from public.maintenance_jobs j join public.blocks b on b.id=j.block_id join public.profiles p on p.id=j.assigned_to where (j.status in ('completed','verified','closed') and (j.completed_at at time zone 'Asia/Kuala_Lumpur')::date=v_today) or j.status in ('assigned','accepted','in_progress','paused','pending_material','under_monitoring','reopened');
  select coalesce(string_agg(format('- %s | %s%s',title,replace(status,'_',' '),case when notes is null or trim(notes)='' then '' else ' | '||notes end),E'\n' order by created_at),'None') into v_admin from public.admin_daily_tasks where task_date=v_today;
  select coalesce(string_agg(format('- %s %s | %s %s | %s | Block %s %s | %s',i.item_code,i.description,h.qty,coalesce(i.unit,''),j.job_no,b.code,j.room_no,p.full_name),E'\n' order by h.issued_at),'None') into v_material from public.inventory_issue_history h join public.inventory_items i on i.id=h.inventory_item_id join public.maintenance_jobs j on j.id=h.job_id join public.blocks b on b.id=j.block_id join public.profiles p on p.id=h.staff_id where (h.issued_at at time zone 'Asia/Kuala_Lumpur')::date=v_today;
  v_payload:=jsonb_build_object('scheduled_today',v_scheduled,'completed_today',v_completed,'in_progress',v_in_progress,'pending_material',v_pending,'under_monitoring',v_monitoring,'partially_completed',v_partial,'appointment',v_appointment,'kiv',v_kiv,'assigned',v_assigned);
  v_text:=format('KLGCR | 4:50 PM Daily Summary | OVERALL\nDate: %s\nScheduled Today: %s\nCompleted Today: %s\nIn Progress: %s\nPending Material: %s\nUnder Monitoring: %s\nPartially Completed: %s\nAppointment: %s\nKIV: %s\nAssigned: %s\n\nCompleted / Carry Forward:\n%s\n\nAdmin Tasks:\n%s\n\nMaterial Issued Today:\n%s',v_today,v_scheduled,v_completed,v_in_progress,v_pending,v_monitoring,v_partial,v_appointment,v_kiv,v_assigned,v_list,v_admin,v_material);
  insert into public.report_snapshots(report_type,report_date,block_group,payload,whatsapp_text,source) values('daily_summary',v_today,'ALL',v_payload,v_text,'automatic');
end $$;
