-- System-generated plan starts at rollout; historical evidence is preserved.
alter table public.waste_schedule_uploads alter column created_by drop not null;
create unique index waste_system_schedule_month on public.waste_schedule_uploads(schedule_month) where source_name='Automatic weekly schedule: Tuesday, Friday, Sunday';
create function public.ensure_waste_weekly_schedule() returns void language plpgsql security invoker set search_path='' as $$
declare m date; upload uuid; today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
 for m in select d::date from generate_series(date '2026-10-01',date_trunc('month',today::timestamp)+interval '3 months',interval '1 month') d loop
  insert into public.waste_schedule_uploads(schedule_month,source_name) values(m,'Automatic weekly schedule: Tuesday, Friday, Sunday') on conflict do nothing;
  select id into upload from public.waste_schedule_uploads where schedule_month=m and source_name='Automatic weekly schedule: Tuesday, Friday, Sunday';
  insert into public.waste_schedule_dates(collection_date,upload_id)
  select d::date,upload from generate_series(m::timestamp,m::timestamp+interval '1 month'-interval '1 day',interval '1 day') d
  where d::date>=date '2026-10-21' and extract(isodow from d) in (2,5,7)
  on conflict(collection_date) do nothing;
 end loop;
end $$;
revoke all on function public.ensure_waste_weekly_schedule() from public,anon,authenticated;
grant execute on function public.ensure_waste_weekly_schedule() to service_role;
select public.ensure_waste_weekly_schedule();
create extension if not exists pg_cron;
select cron.schedule('klgcr-waste-weekly-plan','5 16 * * *','select public.ensure_waste_weekly_schedule()');
