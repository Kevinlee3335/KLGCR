-- V1.0 additive intake tracking. Count complaints, not jobs; completed rows remain.
create or replace function public.complaint_intake_summary(p_date date, p_group text default 'ALL')
returns jsonb language sql stable security invoker set search_path = ''
as $summary$
with intake as (
  select c.id,c.status::text as complaint_status,c.assigned_at,
    exists(select 1 from public.maintenance_jobs j where j.complaint_id=c.id) as dispatched,
    (select j.status::text from public.maintenance_jobs j where j.complaint_id=c.id
     order by j.assigned_at desc,j.id desc limit 1) as job_status
  from public.complaints c join public.blocks b on b.id=c.block_id
  where c.submitted_at >= (p_date::timestamp at time zone 'Asia/Kuala_Lumpur')
    and c.submitted_at < ((p_date+1)::timestamp at time zone 'Asia/Kuala_Lumpur')
    and (p_group='ALL' or (p_group='AB' and b.code in ('A','B')) or (p_group='CD' and b.code in ('C','D')))
), classified as (
 select *,case
   when complaint_status='rejected' then 'rejected'
   when job_status='completed' or (job_status is null and complaint_status='closed') then 'completed'
   when job_status in ('assigned','in_progress','pending_material','under_monitoring','cancelled') then job_status
   else 'unassigned' end as bucket
 from intake
)
select jsonb_build_object('date',p_date,'total',count(*),
 'dispatched',count(*) filter(where dispatched or assigned_at is not null),
 'unassigned',count(*) filter(where bucket='unassigned'),
 'assigned',count(*) filter(where bucket='assigned'),
 'in_progress',count(*) filter(where bucket='in_progress'),
 'completed',count(*) filter(where bucket='completed'),
 'under_monitoring',count(*) filter(where bucket='under_monitoring'),
 'pending_material',count(*) filter(where bucket='pending_material'),
 'rejected',count(*) filter(where bucket='rejected'),
 'cancelled',count(*) filter(where bucket='cancelled')) from classified
$summary$;
revoke all on function public.complaint_intake_summary(date,text) from public,anon;
grant execute on function public.complaint_intake_summary(date,text) to authenticated;

-- Capture the same cohort at report creation for manual + scheduled generators.
-- INSERT only: previously issued reports remain unchanged when jobs progress.
create or replace function public.capture_report_complaint_intake()
returns trigger language plpgsql security invoker set search_path = ''
as $capture$
declare summary jsonb;
begin
 if new.report_type::text not in ('morning_tasks','daily_summary','midday_update','progress_snapshot') then
   return new;
 end if;
 -- The preview/manual builder already captures this same cohort.
 if new.payload ? 'complaint_intake' then return new; end if;
 summary := public.complaint_intake_summary(new.report_date,new.block_group);
 new.payload := coalesce(new.payload,'{}'::jsonb) || jsonb_build_object('complaint_intake',summary);
 if position('Scheduled Today:' in coalesce(new.whatsapp_text,'')) > 0 then
   new.whatsapp_text := replace(new.whatsapp_text,'Scheduled Today:',
     'Complaints received today: ' || (summary->>'total') || E'\nScheduled Today:');
 else
   new.whatsapp_text := coalesce(new.whatsapp_text,'') || E'\nComplaints received today: ' || (summary->>'total');
 end if;
 return new;
end
$capture$;
revoke all on function public.capture_report_complaint_intake() from public,anon,authenticated;
create trigger report_complaint_intake before insert on public.report_snapshots
for each row execute function public.capture_report_complaint_intake();
