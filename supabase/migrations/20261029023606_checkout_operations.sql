-- Check-out requests share the existing approval / issue / stock workflow.
alter table public.material_requests alter column job_id drop not null;
alter table public.material_requests add column checkout_room_id uuid references public.checkout_rooms(id) on delete restrict;
alter table public.material_requests add constraint material_request_one_origin check ((job_id is not null)::int + (checkout_room_id is not null)::int = 1);
create index material_requests_checkout_idx on public.material_requests(checkout_room_id,created_at desc) where checkout_room_id is not null;
alter table public.inventory_issue_history alter column job_id drop not null;
alter table public.inventory_issue_history add column checkout_room_id uuid references public.checkout_rooms(id) on delete restrict;
alter table public.inventory_issue_history add constraint material_issue_one_origin check ((job_id is not null)::int + (checkout_room_id is not null)::int = 1);

create function public.create_checkout_material_request(p_room_id uuid,p_note text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request uuid; v_item jsonb; v_item_id uuid; v_other text;
begin
 if auth.uid() is null or public.current_role()<>'maintenance_staff' then raise exception 'Maintenance staff access required'; end if;
 perform 1 from public.checkout_rooms where id=p_room_id and assigned_to=auth.uid() and status='rectification' and deleted_at is null for update;
 if not found then raise exception 'Assigned check-out room awaiting repairs not found'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Select 1 to 3 materials'; end if;
 if jsonb_array_length(p_items) not between 1 and 3 then raise exception 'Select 1 to 3 materials'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x group by coalesce(x->>'inventory_item_id',lower(trim(x->>'other_item_name'))) having count(*)>1) then raise exception 'Do not select the same material more than once'; end if;
 insert into public.material_requests(checkout_room_id,requested_by,note) values(p_room_id,auth.uid(),nullif(trim(p_note),'')) returning id into v_request;
 for v_item in select * from jsonb_array_elements(p_items) loop
  if coalesce((v_item->>'qty')::numeric,0)<=0 or (v_item->>'qty')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid quantity'; end if;
  v_item_id:=nullif(v_item->>'inventory_item_id','')::uuid; v_other:=nullif(trim(v_item->>'other_item_name'),'');
  if v_item_id is null then
   if v_other is null or length(v_other)>200 then raise exception 'Enter the Other item name'; end if;
  elsif not exists(select 1 from public.inventory_items where id=v_item_id and is_active) then raise exception 'Inventory item not found'; end if;
  insert into public.material_request_items(request_id,inventory_item_id,other_item_name,requested_qty) values(v_request,v_item_id,case when v_item_id is null then v_other end,(v_item->>'qty')::numeric);
 end loop;
 insert into public.checkout_history(checkout_room_id,actor_id,action,notes,from_status,to_status) values(p_room_id,auth.uid(),'material_requested',nullif(trim(p_note),''),'rectification','rectification');
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
 -- Deterministic lock order; an unmatched Other item must be purchased/matched first.
 for r in select * from public.material_request_items where request_id=p_request_id and coalesce(approved_qty,0)>0 order by inventory_item_id,id loop
  if r.inventory_item_id is null then raise exception 'Match every Other item to inventory before issuing'; end if;
  select balance_qty into v_before from public.inventory_items where id=r.inventory_item_id for update;
  if not found or v_before<r.approved_qty then raise exception 'Insufficient inventory for item %',r.inventory_item_id; end if;
  update public.inventory_items set balance_qty=balance_qty-r.approved_qty where id=r.inventory_item_id;
  update public.material_request_items set issued_qty=r.approved_qty where id=r.id;
  insert into public.inventory_issue_history(request_id,job_id,checkout_room_id,inventory_item_id,staff_id,qty,balance_before,balance_after,issued_by) values(p_request_id,v_job,v_checkout,r.inventory_item_id,v_staff,r.approved_qty,v_before,v_before-r.approved_qty,auth.uid());
 end loop;
 update public.material_requests set status='issued',issued_by=auth.uid(),issued_at=now() where id=p_request_id;
 if v_checkout is not null then
  insert into public.checkout_history(checkout_room_id,actor_id,action,notes) values(v_checkout,auth.uid(),'material_issued','Materials issued through the inventory workflow');
 end if;
end $$;
revoke all on function public.issue_material_request(uuid) from public,anon;
grant execute on function public.issue_material_request(uuid) to authenticated;

-- General workers do not need system accounts; administrators maintain their work log.
create table public.checkout_painting_tasks (
 defect_id uuid primary key references public.checkout_defects(id) on delete restrict,
 worker_name text not null check(length(trim(worker_name)) between 1 and 150),
 status text not null default 'assigned' check(status in ('assigned','in_progress','completed')),
 notes text, updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now()
);
alter table public.checkout_painting_tasks enable row level security;
create policy "management reads painting tasks" on public.checkout_painting_tasks for select to authenticated using(public.is_management());
create policy "admins maintain painting tasks" on public.checkout_painting_tasks for all to authenticated using(public.is_admin()) with check(public.is_admin() and updated_by=auth.uid());
grant select,insert,update on public.checkout_painting_tasks to authenticated;

create function public.update_checkout_painting(p_defect_id uuid,p_worker text,p_status text,p_notes text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_room public.checkout_rooms%rowtype; v_description text;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 select r.* into v_room from public.checkout_rooms r join public.checkout_defects d on d.checkout_room_id=r.id where d.id=p_defect_id and r.deleted_at is null for update of r;
 if not found then raise exception 'Check-out defect not found'; end if;
 if p_status not in ('assigned','in_progress','completed') or p_status is null then raise exception 'Invalid painting status'; end if;
 if length(trim(coalesce(p_worker,''))) not between 1 and 150 then raise exception 'Enter the general worker name'; end if;
 select description into v_description from public.checkout_defects where id=p_defect_id;
 insert into public.checkout_painting_tasks(defect_id,worker_name,status,notes,updated_by) values(p_defect_id,trim(p_worker),p_status,nullif(trim(p_notes),''),auth.uid())
 on conflict(defect_id) do update set worker_name=excluded.worker_name,status=excluded.status,notes=excluded.notes,updated_by=auth.uid(),updated_at=now();
 insert into public.checkout_history(checkout_room_id,actor_id,action,notes,from_status,to_status) values(v_room.id,auth.uid(),'painting_updated',v_description||' | '||trim(p_worker)||' | '||p_status||coalesce(' | '||nullif(trim(p_notes),''),''),v_room.status,v_room.status);
 -- Painting completion is separate from repair verification: no room is silently marked ready.
end $$;
revoke all on function public.update_checkout_painting(uuid,text,text,text) from public,anon;
grant execute on function public.update_checkout_painting(uuid,text,text,text) to authenticated;

-- Shared counts for dashboard, manual and automatic report snapshots. MYT boundaries.
create function public.checkout_operations_summary(p_date date default (now() at time zone 'Asia/Kuala_Lumpur')::date,p_group text default 'ALL')
returns jsonb language sql stable security invoker set search_path='' as $$
with rooms as (
 select r.* from public.checkout_rooms r join public.blocks b on b.id=r.block_id where r.deleted_at is null and r.created_at<((p_date+1)::timestamp at time zone 'Asia/Kuala_Lumpur')
 and (p_group='ALL' or (p_group='AB' and b.code in ('A','B')) or (p_group='CD' and b.code in ('C','D')))
), classified as (
 select r.*,
 exists(select 1 from public.checkout_defects d where d.checkout_room_id=r.id and d.description !~* '^\s*no defects?[.!]?\s*$') as has_repairs,
 not exists(select 1 from public.checkout_defects d where d.checkout_room_id=r.id and d.description !~* '^\s*no defects?[.!]?\s*$' and d.status<>'rectified') as repairs_done,
 exists(select 1 from public.checkout_history h where h.checkout_room_id=r.id and h.action='rectification_completed' and (h.created_at at time zone 'Asia/Kuala_Lumpur')::date=p_date) as repair_today,
 exists(select 1 from public.checkout_history h where h.checkout_room_id=r.id and h.action='cleaning_completed') as cleaned,
 exists(select 1 from public.checkout_history h where h.checkout_room_id=r.id and h.action='cleaning_completed' and (h.created_at at time zone 'Asia/Kuala_Lumpur')::date=p_date) as cleaned_today
 from rooms r
), cleaner_rows as (
 select c.cleaner_id,coalesce(p.full_name,'Unassigned') as name,count(*) as total,
 count(*) filter(where c.cleaned or c.status='ready_for_occupancy') as completed,
 count(*) filter(where c.status='cleaning') as in_progress,count(*) filter(where c.cleaned_today) as completed_today
 from classified c left join public.profiles p on p.id=c.cleaner_id where c.cleaner_id is not null group by c.cleaner_id,p.full_name
)
select jsonb_build_object('date',p_date,'total',(select count(*) from classified),'received_today',(select count(*) from classified where (created_at at time zone 'Asia/Kuala_Lumpur')::date=p_date),
 'ready',(select count(*) from classified where status='ready_for_occupancy'),'ready_today',(select count(*) from classified where (ready_at at time zone 'Asia/Kuala_Lumpur')::date=p_date),
 'maintenance',jsonb_build_object('total',(select count(*) from classified where has_repairs),'completed',(select count(*) from classified where has_repairs and repairs_done),'in_progress',(select count(*) from classified where status='rectification'),'completed_today',(select count(*) from classified where repair_today),'no_defect',(select count(*) from classified where not has_repairs)),
 'cleaning',jsonb_build_object('total',(select count(*) from classified where cleaner_id is not null),'completed',(select count(*) from classified where cleaned or status='ready_for_occupancy'),'in_progress',(select count(*) from classified where status='cleaning'),'completed_today',(select count(*) from classified where cleaned_today)),
 'cleaners',coalesce((select jsonb_agg(to_jsonb(cleaner_rows) order by name) from cleaner_rows),'[]'::jsonb))
$$;
revoke all on function public.checkout_operations_summary(date,text) from public,anon;
grant execute on function public.checkout_operations_summary(date,text) to authenticated,service_role;

create function public.checkout_operations_report_text(p_summary jsonb)
returns text language sql immutable security invoker set search_path='' as $$
select E'CHECK-OUT ROOMS\nTotal rooms: '||(p_summary->>'total')||' | Received today: '||(p_summary->>'received_today')||E'\nReady for occupancy: '||(p_summary->>'ready')||' | Ready today: '||(p_summary->>'ready_today')||
 E'\nMaintenance | Total: '||(p_summary#>>'{maintenance,total}')||' | Completed: '||(p_summary#>>'{maintenance,completed}')||' | In progress: '||(p_summary#>>'{maintenance,in_progress}')||' | Completed today: '||(p_summary#>>'{maintenance,completed_today}')||
 E'\nCleaning | Assigned: '||(p_summary#>>'{cleaning,total}')||' | Completed: '||(p_summary#>>'{cleaning,completed}')||' | In progress: '||(p_summary#>>'{cleaning,in_progress}')||' | Completed today: '||(p_summary#>>'{cleaning,completed_today}')||
 coalesce((select E'\n'||string_agg((x->>'name')||' | Assigned: '||(x->>'total')||' | Completed: '||(x->>'completed')||' | In progress: '||(x->>'in_progress')||' | Completed today: '||(x->>'completed_today'),E'\n') from jsonb_array_elements(p_summary->'cleaners') x),'')
$$;
revoke all on function public.checkout_operations_report_text(jsonb) from public,anon;
grant execute on function public.checkout_operations_report_text(jsonb) to authenticated,service_role;
create function public.capture_checkout_operations_report()
returns trigger language plpgsql security invoker set search_path='' as $$
declare summary jsonb;
begin
 if new.report_type='daily_summary' then
  summary:=public.checkout_operations_summary(new.report_date,new.block_group);
  new.payload:=coalesce(new.payload,'{}'::jsonb)||jsonb_build_object('checkout_operations',summary);
  new.whatsapp_text:=coalesce(new.whatsapp_text,'')||E'\n\n'||public.checkout_operations_report_text(summary);
 end if;
 return new;
end $$;
revoke all on function public.capture_checkout_operations_report() from public,anon,authenticated;
create trigger report_checkout_operations before insert on public.report_snapshots for each row execute function public.capture_checkout_operations_report();
