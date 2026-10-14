-- V1.0: extend Daily Tasks in scheduled reports without changing history or schedules.
create or replace function public.daily_task_report_text(p_date date)
returns text language sql stable security invoker set search_path = ''
as $report$
with departments(category,label,sort_order) as (
  values ('admin','ADMIN TASK',1),('operation','OPERATION TASK',2),('housekeeping','HOUSEKEEPING TASK',3)
), statuses(status,label,sort_order) as (
  values ('pending','Pending',1),('accepted','Accepted',2),('in_progress','In Progress',3),('completed','Completed',4),('kiv','KIV',5)
), eligible as materialized (
  select t.*, coalesce(p.full_name,'Unassigned') as employee
  from public.admin_daily_tasks t left join public.profiles p on p.id=t.assigned_to
  where t.task_date <= p_date and (
    t.status <> 'completed' or t.task_date=p_date
    or (t.completed_at at time zone 'Asia/Kuala_Lumpur')::date=p_date
  )
), sections as (
  select d.category,d.label as department,d.sort_order as department_order,
    s.status,s.label,s.sort_order as status_order,count(t.id) as total,
    coalesce(string_agg(
      format('• %s | %s | Work date: %s%s%s',t.title,t.employee,to_char(t.task_date,'DD/MM/YYYY'),
        case when t.task_date<p_date and t.status<>'completed' then ' | Overdue' else '' end,
        case when nullif(trim(t.notes),'') is not null then ' | '||t.notes else '' end),
      E'\n' order by t.task_date,t.created_at,t.id) filter(where t.id is not null),'None') as items
  from departments d cross join statuses s
  left join eligible t on coalesce(t.task_category,'admin')=d.category and t.status=s.status
  group by d.category,d.label,d.sort_order,s.status,s.label,s.sort_order
), department_text as (
  select department,department_order,
    string_agg(format(E'%s (%s)\n%s',label,total,items),E'\n\n' order by status_order) as body
  from sections group by department,department_order
)
select E'📋 DAILY TASKS\nToday + overdue unfinished + earlier tasks completed today\n' ||
  format('Total: %s | Completed: %s | Not completed: %s',
    (select count(*) from eligible),(select count(*) from eligible where status='completed'),
    (select count(*) from eligible where status<>'completed')) ||
  E'\n\n' || string_agg(department||E'\n'||body,E'\n\n' order by department_order)
from department_text
$report$;
revoke all on function public.daily_task_report_text(date) from public,anon;
grant execute on function public.daily_task_report_text(date) to authenticated;

-- Patch only the old Daily Tasks lookup in the installed report generators.
-- Existing bodies, security modes, grants, maintenance sections and schedules stay intact.
do $patch$
declare signature text; definition text; old_lookup text := $lookup$  select coalesce(string_agg(format('- %s | %s%s',title,replace(status,'_',' '),case when notes is null or trim(notes)='' then '' else ' | '||notes end),E'\n' order by created_at),'None') into v_admin from public.admin_daily_tasks where task_date=v_today;$lookup$;
begin
  foreach signature in array array[
    'public.generate_automatic_report(public.report_type)',
    'public.generate_overall_daily_summary()'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if position('public.write_daily_report(' in definition)>0 then
      continue; -- Newer installations already delegate to the shared writer.
    end if;
    if position(old_lookup in definition)=0 then
      raise exception 'Report function % has changed; inspect before applying this patch',signature;
    end if;
    definition := replace(definition,old_lookup,
      E'  perform public.materialize_recurring_tasks(v_today);\n  v_admin := public.daily_task_report_text(v_today);');
    definition := replace(definition,'Admin Tasks:\n','');
    definition := replace(definition,'9:00 AM Morning Daily Task','9:30 AM Morning Daily Task');
    execute definition;
  end loop;
end
$patch$;


-- Support repositories where both scheduled generators delegate to write_daily_report.
do $writer$
declare definition text; old_section text := $old$  select string_agg('• '||t.title||' | '||replace(t.status,'_',' ')||' | '||coalesce(p.full_name,'Unassigned')||case when t.notes is not null then ' | '||t.notes else '' end,E'\n' order by t.created_at) into section from public.admin_daily_tasks t left join public.profiles p on p.id=t.assigned_to where t.task_date=today;
  report:=report||E'\n\n📋 ADMIN TASKS\n'||coalesce(section,'None');
$old$;
begin
  if to_regprocedure('public.write_daily_report(public.report_type,text)') is null then return; end if;
  definition := pg_get_functiondef('public.write_daily_report(public.report_type,text)'::regprocedure);
  if position(old_section in definition)=0 then
    raise exception 'Shared report writer has changed; inspect before applying this patch';
  end if;
  definition := replace(definition,old_section,
    E'  perform public.materialize_recurring_tasks(today);\n  report := report || E''\\n\\n'' || public.daily_task_report_text(today);\n');
  execute definition;
end
$writer$;
