-- Step 1: add the per-defect monitoring state.
-- Kept separate from the trigger below because PostgreSQL does not permit
-- a newly-added enum value to be used safely until this migration commits.
alter type public.complaint_defect_status add value if not exists 'under_monitoring';
