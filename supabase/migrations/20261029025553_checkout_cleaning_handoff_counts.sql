-- Count cleaning only after the room is handed to housekeeping.
create or replace function public.checkout_status_report(p_date date,p_group text default 'ALL')
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
 case when r.status in ('second_inspection','rectification') or (r.status='verification' and r.cleaner_id is null) then 'Not handed to cleaning' when h.cleaned_at is not null or r.status='ready_for_occupancy' then 'Completed' when r.status='cleaning' then 'In Progress' else 'Awaiting assignment' end cleaner_status,
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
 'cleaner_total',count(*) filter(where cleaner_status<>'Not handed to cleaning'),'cleaner_completed',count(*) filter(where cleaner_status='Completed'),'cleaner_today',count(*) filter(where cleaner_today),
 'cleaner_in_progress',count(*) filter(where cleaner_status='In Progress'),
 'rooms',coalesce(jsonb_agg(to_jsonb(enriched) order by block,room_no),'[]'::jsonb)) from enriched
$$;
revoke all on function public.checkout_status_report(date,text) from public,anon;
grant execute on function public.checkout_status_report(date,text) to authenticated;

create or replace function public.checkout_report_text(p_date date,p_group text default 'ALL')
returns text language sql stable security invoker set search_path='' as $$
with summary as (select public.checkout_status_report(p_date,p_group) s)
select format(E'🏨 CHECK-OUT ROOMS\nTotal: %s | Ready: %s | Ready today: %s\nMaintenance — Completed: %s | Completed today: %s | Pending Material: %s\nCleaner — Handed over: %s | Completed: %s | Completed today: %s | In Progress: %s\n\nROOM STATUS\n%s',
 s->>'total',s->>'ready',s->>'ready_today',s->>'maintenance_completed',s->>'maintenance_today',s->>'pending_material',
 s->>'cleaner_total',s->>'cleaner_completed',s->>'cleaner_today',s->>'cleaner_in_progress',
 coalesce((select string_agg(format('• Block %s %s | Maintenance: %s (%s) | Cleaner: %s (%s)',r->>'block',r->>'room_no',r->>'maintenance_status',r->>'maintenance',r->>'cleaner_status',r->>'cleaner'),E'\n') from jsonb_array_elements(s->'rooms') r where r->>'status'<>'ready_for_occupancy' or (r->>'ready_today')::boolean),'None')) from summary
$$;
revoke all on function public.checkout_report_text(date,text) from public,anon;
grant execute on function public.checkout_report_text(date,text) to authenticated;

