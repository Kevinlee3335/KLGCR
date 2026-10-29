-- Check-out materials use the existing approval/issue pipeline without creating defect jobs.
alter table public.material_requests alter column job_id drop not null;
alter table public.material_requests add column checkout_room_id uuid references public.checkout_rooms(id);
alter table public.material_requests add constraint material_request_one_source check (num_nonnulls(job_id,checkout_room_id)=1);
create index material_requests_checkout_idx on public.material_requests(checkout_room_id,created_at desc) where checkout_room_id is not null;
alter table public.inventory_issue_history alter column job_id drop not null;
alter table public.inventory_issue_history add column checkout_room_id uuid references public.checkout_rooms(id);
alter table public.inventory_issue_history add constraint inventory_issue_one_source check (num_nonnulls(job_id,checkout_room_id)=1);
create index inventory_issue_checkout_idx on public.inventory_issue_history(checkout_room_id,issued_at) where checkout_room_id is not null;

create function public.create_checkout_material_request(p_checkout_id uuid,p_note text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request uuid; v_item jsonb; v_item_id uuid; v_other text;
begin
 if auth.uid() is null or public.current_role() is distinct from 'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
 perform 1 from public.checkout_rooms where id=p_checkout_id and assigned_to=auth.uid() and status='rectification' and deleted_at is null for update;
 if not found then raise exception 'Room is not assigned to you for rectification'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 3 then raise exception 'Select 1 to 3 materials'; end if;
 insert into public.material_requests(checkout_room_id,requested_by,note) values(p_checkout_id,auth.uid(),nullif(trim(p_note),'')) returning id into v_request;
 for v_item in select * from jsonb_array_elements(p_items) loop
  if coalesce((v_item->>'qty')::numeric,0)<=0 or (v_item->>'qty')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid quantity'; end if;
  v_item_id:=nullif(v_item->>'inventory_item_id','')::uuid; v_other:=nullif(trim(v_item->>'other_item_name'),'');
  if v_item_id is null then
   if v_other is null or length(v_other)>200 then raise exception 'Enter the Other item name'; end if;
  elsif not exists(select 1 from public.inventory_items where id=v_item_id and is_active) then raise exception 'Inventory item not found'; end if;
  if exists(select 1 from public.material_request_items where request_id=v_request and (inventory_item_id=v_item_id or (v_item_id is null and lower(other_item_name)=lower(v_other)))) then raise exception 'Duplicate material'; end if;
  insert into public.material_request_items(request_id,inventory_item_id,other_item_name,requested_qty) values(v_request,v_item_id,case when v_item_id is null then v_other end,(v_item->>'qty')::numeric);
 end loop;
 insert into public.checkout_history(checkout_room_id,actor_id,action,notes) values(p_checkout_id,auth.uid(),'material_requested',nullif(trim(p_note),''));
 return v_request;
end $$;
revoke all on function public.create_checkout_material_request(uuid,text,jsonb) from public,anon;
grant execute on function public.create_checkout_material_request(uuid,text,jsonb) to authenticated;

create or replace function public.issue_material_request(p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r record; v_job uuid; v_checkout uuid; v_staff uuid; v_before numeric;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 select job_id,checkout_room_id,requested_by into v_job,v_checkout,v_staff from public.material_requests where id=p_request_id and status='approved' for update;
 if not found then raise exception 'Approved request not found'; end if;
 if exists(select 1 from public.material_request_items where request_id=p_request_id and coalesce(approved_qty,0)>0 and inventory_item_id is null) then raise exception 'Match Other materials to stock before issuing'; end if;
 for r in select * from public.material_request_items where request_id=p_request_id and coalesce(approved_qty,0)>0 order by inventory_item_id loop
  select balance_qty into v_before from public.inventory_items where id=r.inventory_item_id for update;
  if not found or v_before<r.approved_qty then raise exception 'Insufficient inventory for item %',r.inventory_item_id; end if;
  update public.inventory_items set balance_qty=balance_qty-r.approved_qty where id=r.inventory_item_id;
  update public.material_request_items set issued_qty=r.approved_qty where id=r.id;
  insert into public.inventory_issue_history(request_id,job_id,checkout_room_id,inventory_item_id,staff_id,qty,balance_before,balance_after,issued_by) values(p_request_id,v_job,v_checkout,r.inventory_item_id,v_staff,r.approved_qty,v_before,v_before-r.approved_qty,auth.uid());
 end loop;
 update public.material_requests set status='issued',issued_by=auth.uid(),issued_at=now() where id=p_request_id;
end $$;

-- Offline workers are names, not login accounts. Admin owns all changes.
create table public.checkout_paint_tasks (
 id uuid primary key default gen_random_uuid(), checkout_room_id uuid not null references public.checkout_rooms(id),
 area text not null default 'room' check(area='room'), reasons text[] not null check(cardinality(reasons)>0),
 worker_name text not null check(length(trim(worker_name)) between 1 and 100), work_date date not null,
 notes text, status text not null default 'assigned' check(status in ('assigned','in_progress','completed')),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 completed_at timestamptz, updated_at timestamptz not null default now()
);
create index checkout_paint_room_idx on public.checkout_paint_tasks(checkout_room_id);
create index checkout_paint_date_idx on public.checkout_paint_tasks(work_date,worker_name);
alter table public.checkout_paint_tasks enable row level security;
create policy "management reads paint tasks" on public.checkout_paint_tasks for select to authenticated using(public.is_management());
create policy "admins add paint tasks" on public.checkout_paint_tasks for insert to authenticated with check(public.is_admin() and created_by=auth.uid());
create policy "admins update paint tasks" on public.checkout_paint_tasks for update to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on public.checkout_paint_tasks from anon,authenticated;
grant select,insert,update on public.checkout_paint_tasks to authenticated;
create trigger checkout_paint_updated before update on public.checkout_paint_tasks for each row execute function public.set_updated_at();

-- Shared statistics for dashboard, printable report and 4:50 PM snapshots.
create function public.checkout_status_report(p_date date,p_group text default 'ALL')
returns jsonb language sql stable security invoker set search_path='' as $$
with defect_counts as (
 select checkout_room_id,count(*) filter(where description !~* '^\s*no defects?[.!]?\s*$') total,
 count(*) filter(where description !~* '^\s*no defects?[.!]?\s*$' and status='open') remaining,
 max(rectified_at) filter(where status='rectified') repaired_at from public.checkout_defects group by checkout_room_id
), history as (
 select checkout_room_id,max(created_at) filter(where action='rectification_completed') repaired_at,
 max(created_at) filter(where action='cleaning_completed') cleaned_at from public.checkout_history group by checkout_room_id
), rows as (
 select r.id,r.reference_no,r.room_no,b.code block,r.status,r.assigned_to,r.cleaner_id,
 coalesce(m.full_name,'Unassigned') maintenance,coalesce(c.full_name,'Unassigned') cleaner,
 case when r.status='second_inspection' then 'Awaiting inspection' when coalesce(d.remaining,0)=0 then 'Completed'
 when exists(select 1 from public.material_requests mr where mr.checkout_room_id=r.id and mr.status in ('pending','approved')) then 'Pending Material' else 'In Progress' end maintenance_status,
 case when h.cleaned_at is not null or r.status='ready_for_occupancy' then 'Completed' when r.status='cleaning' then 'In Progress' else 'Awaiting assignment' end cleaner_status,
 coalesce(h.repaired_at,d.repaired_at) repaired_at,coalesce(h.cleaned_at,case when r.status='ready_for_occupancy' then r.ready_at end) cleaned_at,
 case when coalesce(d.total,0)=0 then 100 else round((d.total-d.remaining)*100.0/d.total) end repair_percent,
 (r.ready_at at time zone 'Asia/Kuala_Lumpur')::date=p_date ready_today
 from public.checkout_rooms r join public.blocks b on b.id=r.block_id
 left join public.profiles m on m.id=r.assigned_to left join public.profiles c on c.id=r.cleaner_id
 left join defect_counts d on d.checkout_room_id=r.id left join history h on h.checkout_room_id=r.id
 where r.deleted_at is null and (r.created_at at time zone 'Asia/Kuala_Lumpur')::date<=p_date
 and (p_group='ALL' or (p_group='AB' and b.code in ('A','B')) or (p_group='CD' and b.code in ('C','D')))
), enriched as (
 select *,maintenance_status='Completed' and (repaired_at at time zone 'Asia/Kuala_Lumpur')::date=p_date maintenance_today,
 cleaner_status='Completed' and (cleaned_at at time zone 'Asia/Kuala_Lumpur')::date=p_date cleaner_today from rows
)
select jsonb_build_object('date',p_date,'total',count(*),'ready',count(*) filter(where status='ready_for_occupancy'),
 'ready_today',count(*) filter(where ready_today),'maintenance_completed',count(*) filter(where maintenance_status='Completed'),
 'maintenance_today',count(*) filter(where maintenance_today),'pending_material',count(*) filter(where maintenance_status='Pending Material'),
 'cleaner_completed',count(*) filter(where cleaner_status='Completed'),'cleaner_today',count(*) filter(where cleaner_today),
 'cleaner_in_progress',count(*) filter(where cleaner_status='In Progress'),
 'rooms',coalesce(jsonb_agg(to_jsonb(enriched) order by block,room_no),'[]'::jsonb)) from enriched
$$;
revoke all on function public.checkout_status_report(date,text) from public,anon;
grant execute on function public.checkout_status_report(date,text) to authenticated;

create function public.checkout_report_text(p_date date,p_group text default 'ALL')
returns text language sql stable security invoker set search_path='' as $$
with summary as (select public.checkout_status_report(p_date,p_group) s)
select format(E'🏨 CHECK-OUT ROOMS\nTotal: %s | Ready: %s | Ready today: %s\nMaintenance — Completed: %s | Completed today: %s | Pending Material: %s\nCleaner — Completed: %s | Completed today: %s | In Progress: %s\n\nROOM STATUS\n%s',
 s->>'total',s->>'ready',s->>'ready_today',s->>'maintenance_completed',s->>'maintenance_today',s->>'pending_material',
 s->>'cleaner_completed',s->>'cleaner_today',s->>'cleaner_in_progress',
 coalesce((select string_agg(format('• Block %s %s | Maintenance: %s (%s) | Cleaner: %s (%s)',r->>'block',r->>'room_no',r->>'maintenance_status',r->>'maintenance',r->>'cleaner_status',r->>'cleaner'),E'\n') from jsonb_array_elements(s->'rooms') r where r->>'status'<>'ready_for_occupancy' or (r->>'ready_today')::boolean),'None')) from summary
$$;
revoke all on function public.checkout_report_text(date,text) from public,anon;
grant execute on function public.checkout_report_text(date,text) to authenticated;

-- Enrich new daily summaries only; preserve all previously generated snapshots and schedules.
create function public.attach_checkout_report() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.report_type='daily_summary' and not coalesce(new.payload,'{}'::jsonb)?'checkout' then
  new.payload:=coalesce(new.payload,'{}'::jsonb)||jsonb_build_object('checkout',public.checkout_status_report(new.report_date,new.block_group));
  new.whatsapp_text:=coalesce(new.whatsapp_text,'')||E'\n\n'||public.checkout_report_text(new.report_date,new.block_group);
 end if;
 return new;
end $$;
revoke all on function public.attach_checkout_report() from public,anon,authenticated;
create trigger report_checkout_section before insert on public.report_snapshots for each row execute function public.attach_checkout_report();

create unique index checkout_paint_active_room_idx on public.checkout_paint_tasks(checkout_room_id) where status<>'completed';
create function public.validate_checkout_paint_task() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.checkout_rooms where id=new.checkout_room_id and deleted_at is null and status<>'ready_for_occupancy' for update;
 if not found then raise exception 'Room is unavailable or already ready for occupancy'; end if;
 if tg_op='UPDATE' and (new.checkout_room_id<>old.checkout_room_id or new.created_by<>old.created_by) then raise exception 'Task source cannot be changed'; end if;
 new.completed_at:=case when new.status='completed' then coalesce(new.completed_at,now()) else null end;
 return new;
end $$;
create trigger validate_paint_task before insert or update on public.checkout_paint_tasks for each row execute function public.validate_checkout_paint_task();
create function public.checkout_paint_readiness_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='ready_for_occupancy' and old.status<>'ready_for_occupancy' and exists(select 1 from public.checkout_paint_tasks where checkout_room_id=new.id and status<>'completed') then raise exception 'Complete General Worker painting tasks before marking the room ready'; end if;
 return new;
end $$;
create trigger checkout_paint_ready_guard before update of status on public.checkout_rooms for each row execute function public.checkout_paint_readiness_guard();
revoke all on function public.validate_checkout_paint_task(),public.checkout_paint_readiness_guard() from public,anon,authenticated;
