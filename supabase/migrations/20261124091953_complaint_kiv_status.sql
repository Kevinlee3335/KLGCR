-- Commit the enum value before functions use it.
alter type public.complaint_status add value if not exists 'kiv';
