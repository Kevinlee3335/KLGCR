-- V1.0: presentation only; shared by automatic and manual reports.
-- No changes to selection, task data, report history or schedules.
create or replace function public.daily_task_report_text(p_date date)
returns text language sql stable security invoker set search_path = ''
as $report$
with departments(category,label,sort_order) as (
  values ('admin','🏢 ADMIN TASK',1),('operation','🛠️ OPERATION TASK',2),('housekeeping','🧹 HOUSEKEEPING TASK',3)
), statuses(status,label,sort_order) as (
  values ('pending','⏳ Pending',1),('accepted','👤 Accepted',2),('in_progress','🔵 In Progress',3),('completed','✅ Completed Today',4),('kiv','⏸️ KIV',5)
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
        case when t.task_date<p_date and t.status<>'completed' then ' | ⚠️ Overdue' else '' end,
        case when nullif(trim(t.notes),'') is not null then ' | '||t.notes else '' end),
      E'\n' order by t.task_date,t.created_at,t.id) filter(where t.id is not null),'None') as items
  from departments d cross join statuses s
  left join eligible t on coalesce(t.task_category,'admin')=d.category and t.status=s.status
  group by d.category,d.label,d.sort_order,s.status,s.label,s.sort_order
), department_text as (
  select department,department_order,
    string_agg(case when total=0 then format('%s: 0',label) else format(E'%s (%s)\n%s',label,total,items) end,E'\n' order by status_order) as body
  from sections group by department,department_order
)
select E'📋 DAILY TASKS\nToday + overdue unfinished + earlier tasks completed today\n' ||
  format('📊 Total: %s | ✅ Completed: %s | ⏳ Not completed: %s',
    (select count(*) from eligible),(select count(*) from eligible where status='completed'),
    (select count(*) from eligible where status<>'completed')) ||
  E'\n\n' || string_agg(department||E'\n'||body,E'\n\n' order by department_order)
from department_text
$report$;
revoke all on function public.daily_task_report_text(date) from public,anon;
grant execute on function public.daily_task_report_text(date) to authenticated;

