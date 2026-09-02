-- Phase 5 follow-up: add automatic Overall 4:50 PM daily summary without changing the Phase 1-4 job lifecycle.
create or replace function public.generate_overall_daily_summary()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_scheduled integer;
  v_completed integer;
  v_in_progress integer;
  v_pending integer;
  v_monitoring integer;
  v_assigned integer;
  v_list text;
  v_text text;
  v_payload jsonb;
begin
  select
    count(*) filter(where j.scheduled_for=v_today and j.status not in ('completed','cancelled')),
    count(*) filter(where j.status='completed' and (j.completed_at at time zone 'Asia/Kuala_Lumpur')::date=v_today),
    count(*) filter(where j.status='in_progress'),
    count(*) filter(where j.status='pending_material'),
    count(*) filter(where j.status='under_monitoring'),
    count(*) filter(where j.status='assigned')
  into v_scheduled,v_completed,v_in_progress,v_pending,v_monitoring,v_assigned
  from public.maintenance_jobs j;

  select coalesce(string_agg(format('- %s | Block %s %s | %s | %s | %s',j.job_no,b.code,j.room_no,j.category,replace(j.status::text,'_',' '),p.full_name),E'\n' order by j.assigned_at),'None')
  into v_list
  from public.maintenance_jobs j
  join public.blocks b on b.id=j.block_id
  join public.profiles p on p.id=j.assigned_to
  where (j.status='completed' and (j.completed_at at time zone 'Asia/Kuala_Lumpur')::date=v_today)
     or j.status in ('assigned','in_progress','pending_material','under_monitoring');

  v_payload := jsonb_build_object(
    'scheduled_today',v_scheduled,
    'completed_today',v_completed,
    'in_progress',v_in_progress,
    'pending_material',v_pending,
    'under_monitoring',v_monitoring,
    'assigned',v_assigned
  );
  v_text := format('KLGCR | 4:50 PM Daily Summary | OVERALL\nDate: %s\nScheduled Today: %s\nCompleted Today: %s\nIn Progress: %s\nPending Material: %s\nUnder Monitoring: %s\nAssigned: %s\n\nCompleted / Carry Forward:\n%s',v_today,v_scheduled,v_completed,v_in_progress,v_pending,v_monitoring,v_assigned,v_list);

  insert into public.report_snapshots(report_type,report_date,block_group,payload,whatsapp_text,source)
  values('daily_summary',v_today,'ALL',v_payload,v_text,'automatic');
end $$;

revoke all on function public.generate_overall_daily_summary() from public;

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='klgcr-phase5-overall-daily-summary' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
end $$;

select cron.schedule('klgcr-phase5-overall-daily-summary','50 8 * * *',$$select public.generate_overall_daily_summary();$$);
