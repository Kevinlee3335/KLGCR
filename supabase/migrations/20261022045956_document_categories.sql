-- Null retains automatic categorisation based on the original filename.
alter table public.system_documents add column category text
  check (category is null or category in (
    'Bomba Approved Plans', 'Approved Passive Plans', 'Fire Protection Systems',
    'Room Layout & Information', 'Room Photos & Mock-ups', 'Site Plans & Survey',
    'Furniture & Damage Charges', 'Lift Documents', 'Clinic Plans', 'Other Documents'
  ));
-- Only category metadata may be updated by existing document managers.
grant update (category) on public.system_documents to authenticated;
create policy "management classify documents" on public.system_documents
  for update to authenticated using (public.is_management()) with check (public.is_management());
