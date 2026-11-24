-- Privileged complaint intake changes use the existing Super Admin identity
-- check and audit trail. Linked jobs must keep their own progress workflow.
create or replace function public.super_admin_update_complaint(p_complaint uuid, p_status text, p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare c public.complaints%rowtype; updated public.complaints%rowtype; note text;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Super Admin access required.';
  end if;
  note := trim(coalesce(p_reason,''));
  if length(note)<3 or length(note)>1000 then raise exception 'Reason must be 3–1000 characters.'; end if;
  if p_status is null or p_status not in ('new','under_review','kiv','rejected') then
    raise exception 'Invalid complaint status. Assign or complete linked maintenance jobs through their workflow.';
  end if;
  select * into c from public.complaints where id=p_complaint for update;
  if not found then raise exception 'Complaint not found.'; end if;
  if exists(select 1 from public.maintenance_jobs where complaint_id=p_complaint) then
    raise exception 'This complaint has maintenance jobs. Update the linked jobs instead.';
  end if;
  if c.status::text=p_status and p_status<>'kiv' then raise exception 'This complaint already has the selected status.'; end if;

  update public.complaints set status=p_status::public.complaint_status,
    reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now()
    where id=p_complaint returning * into updated;
  insert into public.complaint_activity(complaint_id,action,note,actor_id)
    values(p_complaint,
      case when p_status='kiv' and c.status='kiv' then 'KIV Note Added'
           when p_status='kiv' then 'Status changed to KIV'
           when p_status='new' then 'Status changed to New'
           when p_status='under_review' then 'Status changed to Under Review'
           else 'Status changed to Rejected' end,
      note,auth.uid());
  insert into public.super_admin_audit(actor_id,operation,entity_type,entity_id,previous_data,new_data,reason)
    values(auth.uid(),'update_status','complaint',p_complaint,to_jsonb(c),to_jsonb(updated),note);
  return jsonb_build_object('complaint_no',c.complaint_no,'old_status',c.status,'new_status',p_status);
end;
$$;
revoke all on function public.super_admin_update_complaint(uuid,text,text) from public,anon;
grant execute on function public.super_admin_update_complaint(uuid,text,text) to authenticated;

-- The existing Under Review action also resumes a held complaint.
create or replace function public.mark_complaint_under_review(p_complaint_id uuid,p_note text default null)
returns void language plpgsql security definer set search_path=''
as $$
declare v_status public.complaint_status; v_note text := nullif(trim(p_note),'');
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if v_note is not null and length(v_note)>1000 then raise exception 'Under Review note is too long'; end if;
  select status into v_status from public.complaints where id=p_complaint_id for update;
  if not found then raise exception 'Complaint not found'; end if;
  if v_status not in ('new','under_review','kiv') or exists(select 1 from public.maintenance_jobs where complaint_id=p_complaint_id) then
    raise exception 'Only an unassigned complaint can be put under review';
  end if;
  update public.complaints set status='under_review',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_complaint_id;
  insert into public.complaint_activity(complaint_id,action,note,actor_id)
    values(p_complaint_id,case when v_status='under_review' then 'Under Review Note Added' else 'Status changed to Under Review' end,v_note,auth.uid());
end;
$$;
revoke all on function public.mark_complaint_under_review(uuid,text) from public,anon;
grant execute on function public.mark_complaint_under_review(uuid,text) to authenticated;

-- V1.0 additive intake tracking. Count complaints, not jobs; completed rows remain.
create or replace function public.complaint_intake_summary(p_date date, p_group text default 'ALL')
returns jsonb language sql stable security invoker set search_path = ''
as $summary$
with intake as (
  select c.id,c.status::text as complaint_status,c.assigned_at,
    exists(select 1 from public.maintenance_jobs j where j.complaint_id=c.id) as dispatched,
    (select j.status::text from public.maintenance_jobs j where j.complaint_id=c.id
     order by j.assigned_at desc,j.id desc limit 1) as job_status
  from public.complaints c join public.blocks b on b.id=c.block_id
  where c.submitted_at >= (p_date::timestamp at time zone 'Asia/Kuala_Lumpur')
    and c.submitted_at < ((p_date+1)::timestamp at time zone 'Asia/Kuala_Lumpur')
    and (p_group='ALL' or (p_group='AB' and b.code in ('A','B')) or (p_group='CD' and b.code in ('C','D')))
), classified as (
 select *,case
   when complaint_status='rejected' then 'rejected'
   when complaint_status='kiv' then 'kiv'
   when job_status='completed' or (job_status is null and complaint_status='closed') then 'completed'
   when job_status in ('assigned','in_progress','pending_material','under_monitoring','cancelled') then job_status
   else 'unassigned' end as bucket
 from intake
)
select jsonb_build_object('date',p_date,'total',count(*),
 'dispatched',count(*) filter(where dispatched or assigned_at is not null),
 'unassigned',count(*) filter(where bucket='unassigned'),
 'assigned',count(*) filter(where bucket='assigned'),
 'in_progress',count(*) filter(where bucket='in_progress'),
 'completed',count(*) filter(where bucket='completed'),
 'under_monitoring',count(*) filter(where bucket='under_monitoring'),
 'pending_material',count(*) filter(where bucket='pending_material'),
 'kiv',count(*) filter(where bucket='kiv'),
 'rejected',count(*) filter(where bucket='rejected'),
 'cancelled',count(*) filter(where bucket='cancelled')) from classified
$summary$;
revoke all on function public.complaint_intake_summary(date,text) from public,anon;
grant execute on function public.complaint_intake_summary(date,text) to authenticated;


notify pgrst, 'reload schema';
