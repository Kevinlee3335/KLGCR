-- Multi-defect jobs: defect progress determines the overall job status.
alter type public.complaint_defect_status add value if not exists 'under_monitoring';

create or replace function public.sync_job_status_from_complaint_defects()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_complaint uuid; v_total integer; v_completed integer; v_pending integer; v_monitoring integer; v_job uuid;
begin
  v_complaint=coalesce(new.complaint_id,old.complaint_id);
  select count(*),count(*) filter(where status='completed'),count(*) filter(where status='pending_material'),count(*) filter(where status='under_monitoring')
  into v_total,v_completed,v_pending,v_monitoring from public.complaint_defects where complaint_id=v_complaint;
  select id into v_job from public.maintenance_jobs where complaint_id=v_complaint;
  if v_job is null or v_total<=1 then return coalesce(new,old); end if;
  update public.maintenance_jobs set status=case when v_completed=v_total then 'completed'::public.job_status when v_pending>0 then 'pending_material'::public.job_status when v_monitoring>0 then 'under_monitoring'::public.job_status else 'in_progress'::public.job_status end,
    completed_at=case when v_completed=v_total then coalesce(completed_at,now()) else null end
  where id=v_job;
  return coalesce(new,old);
end $$;
drop trigger if exists complaint_defects_sync_job_status on public.complaint_defects;
create trigger complaint_defects_sync_job_status after insert or update of status on public.complaint_defects for each row execute function public.sync_job_status_from_complaint_defects();
