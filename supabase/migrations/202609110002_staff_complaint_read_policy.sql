-- Allow staff to resolve complaint details only through jobs they may already read.
-- SECURITY DEFINER avoids recursive RLS evaluation between complaints and jobs;
-- the predicate intentionally mirrors the maintenance_jobs staff SELECT policy.
create or replace function public.staff_can_read_job_complaint(p_complaint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.current_role() = 'maintenance_staff'
    and exists (
      select 1
      from public.maintenance_jobs j
      join public.profile_blocks pb
        on pb.profile_id = auth.uid()
       and pb.block_id = j.block_id
      where j.complaint_id = p_complaint_id
        and j.assigned_to = auth.uid()
    );
$$;

revoke all on function public.staff_can_read_job_complaint(uuid) from public;
grant execute on function public.staff_can_read_job_complaint(uuid) to authenticated;

drop policy if exists "staff reads complaints for assigned allowed jobs" on public.complaints;
create policy "staff reads complaints for assigned allowed jobs"
on public.complaints
for select
to authenticated
using (public.staff_can_read_job_complaint(id));
