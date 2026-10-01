-- Use an explicit cleaner check for the authenticated request.  The previous
-- current_role() policy was not evaluating correctly for Cleaner Report inserts.
create or replace function public.is_cleaner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'cleaner'
      and p.is_active
      and p.deleted_at is null
  )
$$;

revoke all on function public.is_cleaner() from public;
grant execute on function public.is_cleaner() to authenticated;

drop policy if exists "cleaners create daily defect reports" on public.complaints;
create policy "cleaners create daily defect reports"
on public.complaints for insert to authenticated
with check ((select public.is_cleaner()) and source = 'cleaning');

drop policy if exists "cleaners delete own unsubmitted reports" on public.complaints;
create policy "cleaners delete own unsubmitted reports"
on public.complaints for delete to authenticated
using (
  (select public.is_cleaner())
  and source = 'cleaning'
  and source_reference like ('cleaner:' || (select auth.uid())::text || ':%')
  and photo_url is null
);

create or replace function public.cleaner_owns_complaint_path(p_complaint_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.is_cleaner()) and exists (
    select 1
    from public.complaints c
    where c.id::text = p_complaint_id
      and c.source = 'cleaning'
      and c.source_reference like ('cleaner:' || (select auth.uid())::text || ':%')
  ), false)
$$;
