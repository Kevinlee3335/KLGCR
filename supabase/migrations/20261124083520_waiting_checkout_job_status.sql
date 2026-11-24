-- Commit the new enum value before constraints and functions use it.
alter type public.job_status add value if not exists 'waiting_checkout';
