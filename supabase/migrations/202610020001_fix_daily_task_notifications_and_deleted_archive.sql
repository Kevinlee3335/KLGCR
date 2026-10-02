-- The archive table is exposed through the Data API with RLS enabled.  Existing
-- deployments missed this explicit authenticated-role table grant, so the
-- archive trigger could not insert the row for an authorised administrator.
grant select, insert on table public.deleted_complaints to authenticated;
