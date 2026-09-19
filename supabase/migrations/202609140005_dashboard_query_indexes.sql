-- Performance indexes for the most common KLGCR dashboard, job and appointment reads.
-- All are additive and safe to run on the existing production data.

create index if not exists maintenance_jobs_status_updated_at_idx
  on public.maintenance_jobs (status, updated_at desc);

create index if not exists maintenance_jobs_assigned_status_assigned_at_idx
  on public.maintenance_jobs (assigned_to, status, assigned_at desc);

create index if not exists maintenance_jobs_scheduled_status_idx
  on public.maintenance_jobs (scheduled_for, status);

create index if not exists maintenance_jobs_complaint_id_idx
  on public.maintenance_jobs (complaint_id);

create index if not exists appointments_job_status_idx
  on public.appointments (job_id, status);

create index if not exists appointments_complaint_status_idx
  on public.appointments (complaint_id, status);

create index if not exists appointments_date_status_idx
  on public.appointments (appointment_date, status);

create index if not exists complaints_status_submitted_at_idx
  on public.complaints (status, submitted_at desc);

create index if not exists complaint_defects_complaint_created_at_idx
  on public.complaint_defects (complaint_id, created_at);
