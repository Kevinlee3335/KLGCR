-- KLGCR Phase 4: material requests, inventory, issue and adjustment history.
create type public.material_request_status as enum ('pending','approved','rejected','issued');
create type public.inventory_movement_category as enum ('fast','slow','once_in_a_while');
create type public.inventory_adjustment_type as enum ('stock_in','correction_add','correction_remove');

create sequence public.material_request_number_seq;

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  description text not null check (length(trim(description)) > 0),
  category text not null,
  movement_category public.inventory_movement_category not null default 'slow',
  balance_qty numeric(12,2) not null default 0 check (balance_qty >= 0),
  reorder_level numeric(12,2) not null default 0 check (reorder_level >= 0),
  cost numeric(12,2) check (cost is null or cost >= 0),
  unit text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.material_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique default ('MR-' || extract(year from current_date)::text || '-' || lpad(nextval('public.material_request_number_seq')::text,4,'0')),
  job_id uuid not null references public.maintenance_jobs(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  status public.material_request_status not null default 'pending',
  note text,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  rejection_reason text,
  issued_by uuid references public.profiles(id) on delete restrict,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.material_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.material_requests(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  requested_qty numeric(12,2) not null check (requested_qty > 0),
  approved_qty numeric(12,2) check (approved_qty is null or approved_qty >= 0),
  issued_qty numeric(12,2) check (issued_qty is null or issued_qty >= 0),
  unique(request_id, inventory_item_id)
);

create table public.inventory_issue_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.material_requests(id) on delete restrict,
  job_id uuid not null references public.maintenance_jobs(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  staff_id uuid not null references public.profiles(id) on delete restrict,
  qty numeric(12,2) not null check (qty > 0),
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  issued_at timestamptz not null default now()
);

create table public.inventory_adjustment_history (
  id bigint generated always as identity primary key,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  adjustment_type public.inventory_adjustment_type not null,
  qty numeric(12,2) not null check (qty > 0),
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null check (balance_after >= 0),
  note text not null check (length(trim(note)) > 0),
  adjusted_by uuid not null references public.profiles(id) on delete restrict,
  adjusted_at timestamptz not null default now()
);

create index material_requests_job_idx on public.material_requests(job_id, created_at desc);
create index material_requests_status_idx on public.material_requests(status, created_at desc);
create index inventory_issue_job_idx on public.inventory_issue_history(job_id, issued_at desc);
create index inventory_adjustment_item_idx on public.inventory_adjustment_history(inventory_item_id, adjusted_at desc);
create trigger inventory_items_updated_at before update on public.inventory_items for each row execute function public.set_updated_at();
create trigger material_requests_updated_at before update on public.material_requests for each row execute function public.set_updated_at();

alter table public.inventory_items enable row level security;
alter table public.material_requests enable row level security;
alter table public.material_request_items enable row level security;
alter table public.inventory_issue_history enable row level security;
alter table public.inventory_adjustment_history enable row level security;

create policy "authenticated reads active inventory" on public.inventory_items for select to authenticated using (is_active or public.is_management());
create policy "admins manage inventory" on public.inventory_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "management reads requests; staff reads own" on public.material_requests for select to authenticated using (public.is_management() or requested_by = auth.uid());
create policy "management reads request items; staff reads own request items" on public.material_request_items for select to authenticated using (exists(select 1 from public.material_requests r where r.id=request_id and (public.is_management() or r.requested_by=auth.uid())));
create policy "management reads issue history; staff reads own" on public.inventory_issue_history for select to authenticated using (public.is_management() or staff_id=auth.uid());
create policy "management reads inventory adjustments" on public.inventory_adjustment_history for select to authenticated using (public.is_management());

revoke insert,update,delete on public.material_requests, public.material_request_items, public.inventory_issue_history, public.inventory_adjustment_history from authenticated;
grant select on public.inventory_items, public.material_requests, public.material_request_items, public.inventory_issue_history, public.inventory_adjustment_history to authenticated;
grant insert,update,delete on public.inventory_items to authenticated;

create function public.create_material_request(p_job_id uuid, p_note text, p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request uuid; v_item jsonb;
begin
  if public.current_role() <> 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
  if not exists(select 1 from public.maintenance_jobs j where j.id=p_job_id and j.assigned_to=auth.uid() and j.status in ('in_progress','pending_material') and exists(select 1 from public.profile_blocks pb where pb.profile_id=auth.uid() and pb.block_id=j.block_id)) then raise exception 'Job not found or not allowed'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'At least one material is required'; end if;
  insert into public.material_requests(job_id,requested_by,note) values(p_job_id,auth.uid(),nullif(trim(p_note),'')) returning id into v_request;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'qty')::numeric,0) <= 0 then raise exception 'Material quantity must be greater than zero'; end if;
    if not exists(select 1 from public.inventory_items where id=(v_item->>'inventory_item_id')::uuid and is_active) then raise exception 'Inventory item not found'; end if;
    insert into public.material_request_items(request_id,inventory_item_id,requested_qty)
    values(v_request,(v_item->>'inventory_item_id')::uuid,(v_item->>'qty')::numeric);
  end loop;
  if exists(select 1 from public.maintenance_jobs where id=p_job_id and status='in_progress') then
    perform public.set_job_pending_material(p_job_id,coalesce(nullif(trim(p_note),''),'Material requested'));
  end if;
  return v_request;
end $$;

create function public.review_material_request(p_request_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if not p_approve and nullif(trim(p_reason),'') is null then raise exception 'Rejection reason is required'; end if;
  update public.material_requests set status=case when p_approve then 'approved'::public.material_request_status else 'rejected'::public.material_request_status end, reviewed_by=auth.uid(),reviewed_at=now(),rejection_reason=case when p_approve then null else trim(p_reason) end where id=p_request_id and status='pending';
  if not found then raise exception 'Pending request not found'; end if;
  if p_approve then update public.material_request_items set approved_qty=requested_qty where request_id=p_request_id; end if;
end $$;

create function public.issue_material_request(p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r record; v_job uuid; v_staff uuid; v_before numeric;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select job_id,requested_by into v_job,v_staff from public.material_requests where id=p_request_id and status='approved' for update;
  if not found then raise exception 'Approved request not found'; end if;
  for r in select * from public.material_request_items where request_id=p_request_id and coalesce(approved_qty,0)>0 loop
    select balance_qty into v_before from public.inventory_items where id=r.inventory_item_id for update;
    if v_before < r.approved_qty then raise exception 'Insufficient inventory for item %',r.inventory_item_id; end if;
    update public.inventory_items set balance_qty=balance_qty-r.approved_qty where id=r.inventory_item_id;
    update public.material_request_items set issued_qty=r.approved_qty where id=r.id;
    insert into public.inventory_issue_history(request_id,job_id,inventory_item_id,staff_id,qty,balance_before,balance_after,issued_by) values(p_request_id,v_job,r.inventory_item_id,v_staff,r.approved_qty,v_before,v_before-r.approved_qty,auth.uid());
  end loop;
  update public.material_requests set status='issued',issued_by=auth.uid(),issued_at=now() where id=p_request_id;
end $$;

create function public.adjust_inventory_item(p_item_id uuid, p_type public.inventory_adjustment_type, p_qty numeric, p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare v_before numeric; v_after numeric;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if nullif(trim(p_note),'') is null then raise exception 'Adjustment note is required'; end if;
  select balance_qty into v_before from public.inventory_items where id=p_item_id for update;
  if not found then raise exception 'Inventory item not found'; end if;
  if p_type in ('stock_in','correction_add') then v_after := v_before + p_qty; else v_after := v_before - p_qty; end if;
  if v_after < 0 then raise exception 'Adjustment would make stock negative'; end if;
  update public.inventory_items set balance_qty=v_after where id=p_item_id;
  insert into public.inventory_adjustment_history(inventory_item_id,adjustment_type,qty,balance_before,balance_after,note,adjusted_by) values(p_item_id,p_type,p_qty,v_before,v_after,trim(p_note),auth.uid());
end $$;

revoke all on function public.create_material_request(uuid,text,jsonb) from public;
revoke all on function public.review_material_request(uuid,boolean,text) from public;
revoke all on function public.issue_material_request(uuid) from public;
revoke all on function public.adjust_inventory_item(uuid,public.inventory_adjustment_type,numeric,text) from public;
grant execute on function public.create_material_request(uuid,text,jsonb), public.review_material_request(uuid,boolean,text), public.issue_material_request(uuid), public.adjust_inventory_item(uuid,public.inventory_adjustment_type,numeric,text) to authenticated;
