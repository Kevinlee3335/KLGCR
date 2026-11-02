grant select (id, config, revision), update (config, revision, updated_by, updated_at)
on public.billing_preview_settings to service_role;
