-- Keep existing broad permissive policies from granting category edits to staff.
create policy "document category manager guard" on public.system_documents
  as restrictive for update to authenticated
  using (public.is_management()) with check (public.is_management());
