-- Keep only the two requested automatic WhatsApp reports.
-- All cron times are UTC; Malaysia is UTC+8.
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'klgcr-phase5-morning',
  'klgcr-phase5-midday',
  'klgcr-phase5-progress',
  'klgcr-phase5-overall-daily-summary',
  'klgcr-phase5-daily-summary'
);

select cron.schedule(
  'klgcr-phase5-morning',
  '30 1 * * *',
  $cron$select public.generate_automatic_report('morning_tasks');$cron$
);

select cron.schedule(
  'klgcr-phase5-daily-summary',
  '50 8 * * *',
  $cron$select public.generate_automatic_report('daily_summary');$cron$
);
