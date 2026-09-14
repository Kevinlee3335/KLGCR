-- Staff may update progress for their own assigned complaint defects only.
create or replace function public.update_assigned_complaint_defect(
  p_defect_id uuid,
  p_status public.complaint_defect_status,
  p_completion_note text default null
) returns void
language plpgsql security definer set search_path=''
as $$
begin
  if p_status not in ('in_progress','pending_material','completed') then
    raise exception 'Invalid defect progress status';
  end if;
  if not exists (
    select 1
    from public.complaint_defects d
    join public.complaints c on c.id=d.complaint_id
    where d.id=p_defect_id and c.assigned_to=auth.uid()
  ) then
    raise exception 'You are not assigned to this defect';
  end if;
  update public.complaint_defects
  set status=p_status,
      completion_note=nullif(trim(p_completion_note),''),
      completed_by=case when p_status='completed' then auth.uid() else null end,
      completed_at=case when p_status='completed' then now() else null end
  where id=p_defect_id;
end;
$$;
revoke all on function public.update_assigned_complaint_defect(uuid,public.complaint_defect_status,text) from public;
grant execute on function public.update_assigned_complaint_defect(uuid,public.complaint_defect_status,text) to authenticated;
