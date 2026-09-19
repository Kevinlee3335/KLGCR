-- Cleaner daily defect reports feed into the normal Admin complaint review queue.
-- The Cleaner may create only reports identified as source = 'cleaning'.

create policy "cleaners create daily defect reports"
on public.complaints
for insert
to authenticated
with check (
  public.current_role() = 'cleaner'
  and source = 'cleaning'
);
