-- Applied and verified on KLG CAMPUS RESIDENCE, 2026-10-17.
-- Align biweekly occurrences to the first selected weekday on/after starts_on.
do $fix$
declare definition text;
begin
 select pg_get_functiondef('public.materialize_recurring_tasks(date)'::regprocedure) into definition;
 if position('mod(p_date - starts_on, 14) = 0' in definition) = 0 then
   raise exception 'Unexpected recurrence function; no change applied';
 end if;
 definition := replace(definition,
 'mod(p_date - starts_on, 14) = 0',
 'mod(p_date - (starts_on + mod(day_number - extract(dow from starts_on)::integer + 7, 7)), 14) = 0');
 execute definition;
end $fix$;
grant execute on function public.materialize_recurring_tasks(date) to service_role;
grant select, update on public.admin_daily_tasks to service_role;
-- Verified service_role generation for Oct 17, Oct 30, Nov 1 and Feb 28.
-- Repeated materialization produces no duplicate recurrence/date rows.

-- Operational prerequisite: production CRON_SECRET was missing and configured
-- in Vercel on 2026-10-17. Redeploy to load it before running the reminder job.
-- Keep the credential only in Vercel; never store its value in this repository.
