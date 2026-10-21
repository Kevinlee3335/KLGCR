alter table public.memberships drop constraint memberships_status_check;
alter table public.memberships add constraint memberships_status_check check(status in ('pending','active','suspended','cancelled'));

create function public.set_membership_status(p_member uuid,p_actor uuid,p_status text,p_expected text,p_note text) returns void
language plpgsql security invoker set search_path='' as $$
declare member public.memberships;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then raise exception 'Admin permission required'; end if;
 if p_status not in ('active','suspended','cancelled') or p_status is null then raise exception 'Invalid status'; end if;
 if length(trim(coalesce(p_note,'')))=0 or length(p_note)>1000 then raise exception 'A reason is required (maximum 1000 characters)'; end if;
 select * into member from public.memberships where id=p_member for update;
 if member.id is null then raise exception 'Member not found'; end if;
 if member.status is distinct from p_expected then raise exception 'Status changed. Refresh before retrying'; end if;
 if member.status='pending' then raise exception 'Approve initial payment first'; end if;
 if member.status=p_status then raise exception 'Choose a different status'; end if;
 if p_status='active' and (member.expires_on is null or member.expires_on<(now() at time zone 'Asia/Kuala_Lumpur')::date) then raise exception 'Expired membership requires an approved renewal'; end if;
 update public.memberships set status=p_status,cancelled_at=case when p_status='cancelled' then now() else null end where id=p_member;
 if p_status='cancelled' then
  update public.membership_payments set status='rejected',review_note='Membership cancelled by Management: '||p_note,reviewed_by=p_actor,reviewed_at=now() where member_id=p_member and status='pending_verification';
  update public.membership_requests set status='rejected',review_note='Membership cancelled by Management: '||p_note,reviewed_by=p_actor,reviewed_at=now() where member_id=p_member and status='pending';
 end if;
 insert into public.membership_activity(member_id,event,actor_id,details) values(p_member,'status_changed',p_actor,jsonb_build_object('from',member.status,'to',p_status,'note',trim(p_note)));
end $$;
revoke all on function public.set_membership_status(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.set_membership_status(uuid,uuid,text,text,text) to service_role;
-- A payment approval must not silently lift a Management suspension.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.review_membership_payment(uuid,uuid,boolean,text)'::regprocedure) into definition;
 definition:=replace(definition,'if member.status=''cancelled'' then','if member.status in (''cancelled'',''suspended'') then');
 execute definition;
end $$;
