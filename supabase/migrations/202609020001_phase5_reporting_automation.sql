-- KLGCR Phase 5: scheduling, Google-form imports and report snapshot history.
create type public.report_type as enum ('morning_tasks','midday_update','daily_summary','progress_snapshot','inventory_report');
create type public.report_source as enum ('manual','automatic');

alter table public.maintenance_jobs add column scheduled_for date;
alter table public.complaints add column source_reference text;
alter table public.complaints add column photo_url text;

create index maintenance_jobs_scheduled_for_idx on public.maintenance_jobs(scheduled_for,status);
create unique index complaints_source_reference_unique on public.complaints(source_reference) where source_reference is not null;

create table public.google_import_history (
  id bigint generated always as identity primary key,
  imported_by uuid not null references public.profiles(id) on delete restrict,
  file_name text,
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  error_rows integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table public.report_snapshots (
  id bigint generated always as identity primary key,
  report_type public.report_type not null,
  report_date date not null default current_date,
  block_group text not null check (block_group in ('AB','CD','ALL')),
  payload jsonb not null default '{}'::jsonb,
  whatsapp_text text not null,
  source public.report_source not null default 'manual',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index report_snapshots_history_idx on public.report_snapshots(report_date desc,report_type,block_group,created_at desc);

alter table public.google_import_history enable row level security;
alter table public.report_snapshots enable row level security;

create policy "management reads import history" on public.google_import_history for select to authenticated using (public.is_management());
create policy "admins write import history" on public.google_import_history for insert to authenticated with check (public.is_admin() and imported_by=auth.uid());
create policy "management reads reports" on public.report_snapshots for select to authenticated using (public.is_management());
create policy "admins create manual reports" on public.report_snapshots for insert to authenticated with check (public.is_admin() and source='manual' and created_by=auth.uid());

revoke update,delete on public.google_import_history,public.report_snapshots from authenticated;
grant select on public.google_import_history,public.report_snapshots to authenticated;
grant insert on public.google_import_history,public.report_snapshots to authenticated;

create function public.schedule_job(p_job_id uuid,p_date date)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.maintenance_jobs set scheduled_for=p_date where id=p_job_id and status not in ('completed','cancelled');
  if not found then raise exception 'Active job not found'; end if;
end $$;

revoke all on function public.schedule_job(uuid,date) from public;
grant execute on function public.schedule_job(uuid,date) to authenticated;

-- Automatic report generation runs inside Supabase, so it does not depend on
-- Vercel paid cron frequency. Times below are UTC; Malaysia is UTC+8.
create extension if not exists pg_cron;

create function public.generate_automatic_report(p_type public.report_type)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_group text;
  v_codes text[];
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
  if p_type = 'inventory_report' then
    select jsonb_build_object(
      'total',count(*),
      'out_of_stock',count(*) filter(where balance_qty=0),
      'near_reorder',count(*) filter(where balance_qty>0 and balance_qty<=reorder_level)
    ) into v_payload from public.inventory_items where is_active;
    select coalesce(string_agg(format('- %s %s: %s %s',item_code,description,balance_qty,coalesce(unit,'')),E'\n' order by item_code),'None') into v_list
    from public.inventory_items where is_active and (balance_qty=0 or (balance_qty>0 and balance_qty<=reorder_level));
    v_text := format('KLGCR | Inventory Report\nDate: %s\nTotal Items: %s\nOut of Stock: %s\nNear Reorder: %s\n\nItems Requiring Attention:\n%s',v_today,v_payload->>'total',v_payload->>'out_of_stock',v_payload->>'near_reorder',v_list);
    insert into public.report_snapshots(report_type,report_date,block_group,payload,whatsapp_text,source) values('inventory_report',v_today,'ALL',v_payload,v_text,'automatic');
    return;
  end if;

  foreach v_group in array array['AB','CD'] loop
    v_codes := case when v_group='AB' then array['A','B']::text[] else array['C','D']::text[] end;
    select
      count(*) filter(where j.scheduled_for=v_today and j.status not in ('completed','cancelled')),
      count(*) filter(where j.status='completed' and (j.completed_at at time zone 'Asia/Kuala_Lumpur')::date=v_today),
      count(*) filter(where j.status='in_progress'),
      count(*) filter(where j.status='pending_material'),
      count(*) filter(where j.status='under_monitoring'),
      count(*) filter(where j.status='assigned')
    into v_scheduled,v_completed,v_in_progress,v_pending,v_monitoring,v_assigned
    from public.maintenance_jobs j join public.blocks b on b.id=j.block_id where b.code=any(v_codes);

    select coalesce(string_agg(format('- %s | Block %s %s | %s | %s | %s',j.job_no,b.code,j.room_no,j.category,replace(j.status::text,'_',' '),p.full_name),E'\n' order by j.assigned_at),'None') into v_list
    from public.maintenance_jobs j join public.blocks b on b.id=j.block_id join public.profiles p on p.id=j.assigned_to
    where b.code=any(v_codes) and (
      (p_type='morning_tasks' and j.scheduled_for=v_today and j.status not in ('completed','cancelled')) or
      (p_type='daily_summary' and j.status='completed' and (j.completed_at at time zone 'Asia/Kuala_Lumpur')::date=v_today) or
      (p_type in ('midday_update','progress_snapshot') and j.status not in ('completed','cancelled'))
    );

    v_payload := jsonb_build_object('scheduled_today',v_scheduled,'completed_today',v_completed,'in_progress',v_in_progress,'pending_material',v_pending,'under_monitoring',v_monitoring,'assigned',v_assigned);
    v_text := format('KLGCR | %s | %s\nDate: %s\nScheduled Today: %s\nCompleted Today: %s\nIn Progress: %s\nPending Material: %s\nUnder Monitoring: %s\nAssigned: %s\n\n%s',
      case p_type when 'morning_tasks' then '9:00 AM Morning Daily Task' when 'midday_update' then '12:00 PM Midday Update' when 'daily_summary' then '4:50 PM Daily Summary' else '3-Hour Progress Snapshot' end,
      v_group,v_today,v_scheduled,v_completed,v_in_progress,v_pending,v_monitoring,v_assigned,v_list);
    insert into public.report_snapshots(report_type,report_date,block_group,payload,whatsapp_text,source) values(p_type,v_today,v_group,v_payload,v_text,'automatic');
  end loop;

  if p_type='daily_summary' then perform public.generate_automatic_report('inventory_report'); end if;
end $$;

revoke all on function public.generate_automatic_report(public.report_type) from public;

-- 9:00 AM Malaysia (01:00 UTC), 12:00 PM (04:00 UTC), 4:50 PM (08:50 UTC).
select cron.schedule('klgcr-phase5-morning','0 1 * * *',$$select public.generate_automatic_report('morning_tasks');$$);
select cron.schedule('klgcr-phase5-midday','0 4 * * *',$$select public.generate_automatic_report('midday_update');$$);
select cron.schedule('klgcr-phase5-daily-summary','50 8 * * *',$$select public.generate_automatic_report('daily_summary');$$);
-- Progress snapshots every three hours outside the dedicated morning/midday reports.
select cron.schedule('klgcr-phase5-progress','0 7,10,13,16,19,22 * * *',$$select public.generate_automatic_report('progress_snapshot');$$);
