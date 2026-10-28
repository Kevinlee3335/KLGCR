-- Atomic admin follow-up and immutable audit, using the same controlled privilege
-- boundary as staff workflow RPCs (history is not writable by clients).
create function public.admin_follow_up_monitoring_job(
  p_job_id uuid, p_outcome text, p_note text, p_review_at timestamptz default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.job_status;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_outcome is null or p_outcome not in ('completed','in_progress','under_monitoring') then
    raise exception 'Invalid follow-up outcome';
  end if;
  if nullif(trim(p_note),'') is null or length(p_note)>2000 then
    raise exception 'Follow-up remarks are required (maximum 2000 characters)';
  end if;
  if p_outcome='under_monitoring' and (p_review_at is null or
    (p_review_at at time zone 'Asia/Kuala_Lumpur')::date <= (now() at time zone 'Asia/Kuala_Lumpur')::date) then
    raise exception 'Choose a future follow-up date';
  end if;
  select status into v_status from public.maintenance_jobs where id=p_job_id for update;
  if not found or v_status <> 'under_monitoring' then
    raise exception 'Job is no longer under monitoring. Refresh and review its current status';
  end if;
  update public.maintenance_jobs set
    status=p_outcome::public.job_status,
    completed_at=case when p_outcome='completed' then now() else null end,
    action_taken=case when p_outcome='completed' then concat_ws(E'\n',nullif(action_taken,''),'Admin follow-up: '||trim(p_note)) else action_taken end,
    monitoring_review_at=case when p_outcome='under_monitoring' then p_review_at else null end,
    updated_at=now()
  where id=p_job_id;
  insert into public.job_status_history(job_id,previous_status,new_status,note,changed_by)
    values(p_job_id,v_status,p_outcome::public.job_status,
      'Admin follow-up: '||trim(p_note)||case when p_outcome='under_monitoring' then
        ' | Next review: '||to_char(p_review_at at time zone 'Asia/Kuala_Lumpur','YYYY-MM-DD') else '' end,auth.uid());
end;
$$;
revoke all on function public.admin_follow_up_monitoring_job(uuid,text,text,timestamptz) from public, anon;
grant execute on function public.admin_follow_up_monitoring_job(uuid,text,text,timestamptz) to authenticated;
