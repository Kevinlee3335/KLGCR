-- Name/room requests never grant access or expose the member's private management link.
create table public.membership_requests (
 id uuid primary key default gen_random_uuid(),
 full_name text not null,room_no text not null,
 request_type text not null check(request_type in ('renew','cancel')),
 member_id uuid references public.memberships(id),receipt_path text,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 review_note text,reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index membership_request_dedup on public.membership_requests(lower(full_name),lower(room_no),request_type) where status='pending';
create index membership_requests_queue on public.membership_requests(status,created_at);
alter table public.membership_requests enable row level security;
revoke all on public.membership_requests from public,anon,authenticated;
grant all on public.membership_requests to service_role;

create function public.review_membership_request(p_request uuid,p_actor uuid,p_approve boolean,p_note text) returns void language plpgsql security invoker set search_path='' as $$
declare req public.membership_requests; member public.memberships; pid uuid; period date; today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then raise exception 'Admin permission required'; end if;
 select m.* into member from public.memberships m join public.membership_requests r on r.member_id=m.id where r.id=p_request for update of m;
 select * into req from public.membership_requests where id=p_request for update;
 if req.id is null or req.status<>'pending' then raise exception 'Request is no longer pending'; end if;
 if p_approve then
  if member.id is null then raise exception 'Member details must be resolved before approval'; end if;
  if member.status='cancelled' then raise exception 'Membership is cancelled'; end if;
  if req.request_type='renew' and member.status<>'active' then raise exception 'Initial registration must be approved first'; end if;
  if req.request_type='renew' then
   period := case when member.expires_on>=today then (date_trunc('month',member.expires_on)+interval '1 month')::date else date_trunc('month',today)::date end;
   insert into public.membership_payments(member_id,kind,period_start,amount,receipt_path)
   values(member.id,'renewal',period,40,req.receipt_path) returning id into pid;
   perform public.review_membership_payment(pid,p_actor,true,p_note);
  else
   perform public.cancel_membership(member.token_hash);
   insert into public.membership_activity(member_id,event,actor_id,details) values(member.id,'cancellation_approved',p_actor,jsonb_build_object('request_id',req.id));
  end if;
 elsif length(trim(coalesce(p_note,'')))=0 then raise exception 'A rejection reason is required';
 end if;
 update public.membership_requests set status=case when p_approve then 'approved' else 'rejected' end,review_note=p_note,reviewed_by=p_actor,reviewed_at=now() where id=req.id;
end $$;
revoke all on function public.review_membership_request(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.review_membership_request(uuid,uuid,boolean,text) to service_role;
