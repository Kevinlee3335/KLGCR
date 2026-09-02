-- Phase 5: include work-state labels, Admin Tasks and material issued details in automatic reports.
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
    select count(*) filter(where j.scheduled_for=v_today and j.status not in ('completed','cancelled')),count(*) filter(where j.status='completed' and (j.completed_at at time zone 'Asia/Kuala_Lumpur')::date=v_today),count(*) filter(where j.status='in_progress'),count(*) filter(where j.status='pending_material'),count(*) filter(where j.status='under_monitoring'),count(*) filter(where j.status='assigned'),count(*) filter(where j.status not in ('completed','cancelled') and j.work_state='partially_completed'),count(*) filter(where j.status not in ('completed','cancelled') and j.work_state='appointment'),count(*) filter(where j.status not in ('completed','cancelled') and j.work_state='kiv') into v_scheduled,v_completed,v_in_progress,v_pending,v_monitoring,v_assigned,v_partial,v_appointment,v_kiv from public.maintenance_jobs j join public.blocks b on b.id=j.block_id where b.code=any(v_codes);

    select coalesce(string_agg(format('- %s | Block %s %s | %s | %s%s | %s',j.job_no,b.code,j.room_no,j.category,replace(j.status::text,'_',' '),case when j.work_state='standard' then '' else ' | '||replace(j.work_state,'_',' ') end,p.full_name),E'\n' order by j.assigned_at),'None') into v_list from public.maintenance_jobs j join public.blocks b on b.id=j.block_id join public.profiles p on p.id=j.assigned_to where b.code=any(v_codes) and ((p_type='morning_tasks' and j.scheduled_for=v_today and j.status not in ('completed','cancelled')) or (p_type='daily_summary' and j.status='completed' and (j.completed_at at time zone 'Asia/Kuala_Lumpur')::date=v_today) or (p_type in ('midday_update','progress_snapshot') and j.status not in ('completed','cancelled')));

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
  select count(*) filter(where scheduled_for=v_today and status not in ('completed','cancelled')),count(*) filter(where status='completed' and (completed_at at time zone 'Asia/Kuala_Lumpur')::date=v_today),count(*) filter(where status='in_progress'),count(*) filter(where status='pending_material'),count(*) filter(where status='under_monitoring'),count(*) filter(where status='assigned'),count(*) filter(where status not in ('completed','cancelled') and work_state='partially_completed'),count(*) filter(where status not in ('completed','cancelled') and work_state='appointment'),count(*) filter(where status not in ('completed','cancelled') and work_state='kiv') into v_scheduled,v_completed,v_in_progress,v_pending,v_monitoring,v_assigned,v_partial,v_appointment,v_kiv from public.maintenance_jobs;
  select coalesce(string_agg(format('- %s | Block %s %s | %s | %s%s | %s',j.job_no,b.code,j.room_no,j.category,replace(j.status::text,'_',' '),case when j.work_state='standard' then '' else ' | '||replace(j.work_state,'_',' ') end,p.full_name),E'\n' order by j.assigned_at),'None') into v_list from public.maintenance_jobs j join public.blocks b on b.id=j.block_id join public.profiles p on p.id=j.assigned_to where (j.status='completed' and (j.completed_at at time zone 'Asia/Kuala_Lumpur')::date=v_today) or j.status in ('assigned','in_progress','pending_material','under_monitoring');
  select coalesce(string_agg(format('- %s | %s%s',title,replace(status,'_',' '),case when notes is null or trim(notes)='' then '' else ' | '||notes end),E'\n' order by created_at),'None') into v_admin from public.admin_daily_tasks where task_date=v_today;
  select coalesce(string_agg(format('- %s %s | %s %s | %s | Block %s %s | %s',i.item_code,i.description,h.qty,coalesce(i.unit,''),j.job_no,b.code,j.room_no,p.full_name),E'\n' order by h.issued_at),'None') into v_material from public.inventory_issue_history h join public.inventory_items i on i.id=h.inventory_item_id join public.maintenance_jobs j on j.id=h.job_id join public.blocks b on b.id=j.block_id join public.profiles p on p.id=h.staff_id where (h.issued_at at time zone 'Asia/Kuala_Lumpur')::date=v_today;
  v_payload:=jsonb_build_object('scheduled_today',v_scheduled,'completed_today',v_completed,'in_progress',v_in_progress,'pending_material',v_pending,'under_monitoring',v_monitoring,'partially_completed',v_partial,'appointment',v_appointment,'kiv',v_kiv,'assigned',v_assigned);
  v_text:=format('KLGCR | 4:50 PM Daily Summary | OVERALL\nDate: %s\nScheduled Today: %s\nCompleted Today: %s\nIn Progress: %s\nPending Material: %s\nUnder Monitoring: %s\nPartially Completed: %s\nAppointment: %s\nKIV: %s\nAssigned: %s\n\nCompleted / Carry Forward:\n%s\n\nAdmin Tasks:\n%s\n\nMaterial Issued Today:\n%s',v_today,v_scheduled,v_completed,v_in_progress,v_pending,v_monitoring,v_partial,v_appointment,v_kiv,v_assigned,v_list,v_admin,v_material);
  insert into public.report_snapshots(report_type,report_date,block_group,payload,whatsapp_text,source) values('daily_summary',v_today,'ALL',v_payload,v_text,'automatic');
end $$;
