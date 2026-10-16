-- Only server-side service_role may access member PII, tokens and payment receipts.
create table public.memberships (
 id uuid primary key default gen_random_uuid(), full_name text not null, email text not null unique,
 member_type text not null check(member_type in ('resident','outsider')),
 id_type text not null check(id_type in ('IC','Passport')), identification text not null,
 gender text not null, nationality text not null, room_no text not null, student_id text not null, address text not null,
 status text not null default 'pending' check(status in ('pending','active','cancelled')),
 token_hash text not null unique, token_ciphertext text not null,
 created_at timestamptz not null default now(), expires_on date, cancelled_at timestamptz,
 unique(id_type,identification)
);
create table public.membership_payments (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.memberships(id),
 kind text not null check(kind in ('registration','renewal')),
 period_start date not null check(extract(day from period_start)=1),
 amount numeric(10,2) not null check(amount in (40,50)), receipt_path text,
 status text not null default 'pending_verification' check(status in ('pending_verification','approved','rejected')),
 review_note text, reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index membership_payment_period on public.membership_payments(member_id,period_start) where status <> 'rejected';
create index membership_payment_queue on public.membership_payments(status,created_at);
create index membership_expiry on public.memberships(status,expires_on);
create table public.membership_activity (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.memberships(id),
 event text not null, actor_id uuid references public.profiles(id), details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.membership_emails (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.memberships(id),
 event_key text not null unique, kind text not null check(kind in ('approved','reminder')),
 payment_id uuid references public.membership_payments(id), period_start date not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','skipped')),
 attempts integer not null default 0, claimed_at timestamptz, sent_at timestamptz, last_error text,
 created_at timestamptz not null default now()
);
create index membership_email_queue on public.membership_emails(status,created_at);
create table public.membership_request_limits (key text primary key, started_at timestamptz not null default now(), requests integer not null default 1);
alter table public.memberships enable row level security;
alter table public.membership_payments enable row level security;
alter table public.membership_activity enable row level security;
alter table public.membership_emails enable row level security;
alter table public.membership_request_limits enable row level security;
revoke all on public.memberships,public.membership_payments,public.membership_activity,public.membership_emails,public.membership_request_limits from anon,authenticated;
grant all on public.memberships,public.membership_payments,public.membership_activity,public.membership_emails,public.membership_request_limits to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('membership-receipts','membership-receipts',false,3145728,array['image/jpeg','image/png','application/pdf']);

create function public.membership_rate_limit(p_key text) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.membership_request_limits as limits(key) values(p_key)
 on conflict(key) do update set requests=case when limits.started_at < now()-interval '1 hour' then 1 else limits.requests+1 end,
 started_at=case when limits.started_at < now()-interval '1 hour' then now() else limits.started_at end returning requests into n;
 delete from public.membership_request_limits where started_at < now()-interval '2 days';
 return n <= 20;
end $$;

create function public.register_membership(p_member jsonb,p_receipt text) returns uuid language plpgsql security invoker set search_path='' as $$
declare mid uuid := (p_member->>'id')::uuid; period date := date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
 insert into public.memberships(id,full_name,email,member_type,id_type,identification,gender,nationality,room_no,student_id,address,token_hash,token_ciphertext)
 values(mid,p_member->>'full_name',lower(p_member->>'email'),p_member->>'member_type',p_member->>'id_type',p_member->>'identification',p_member->>'gender',p_member->>'nationality',p_member->>'room_no',p_member->>'student_id',p_member->>'address',p_member->>'token_hash',p_member->>'token_ciphertext');
 insert into public.membership_payments(member_id,kind,period_start,amount,receipt_path)
 values(mid,'registration',period,case when p_member->>'member_type'='outsider' then 50 else 40 end,p_receipt);
 insert into public.membership_activity(member_id,event) values(mid,'registration_submitted');
 return mid;
end $$;

create function public.review_membership_payment(p_payment uuid,p_actor uuid,p_approve boolean,p_note text) returns void language plpgsql security invoker set search_path='' as $$
declare payment public.membership_payments; member public.memberships; expiry date; current_month date := date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then raise exception 'Admin permission required'; end if;
 -- Consistent lock order: member, then payments. Cancellation uses the same order.
 select m.* into member from public.memberships m join public.membership_payments p on p.member_id=m.id where p.id=p_payment for update of m;
 select * into payment from public.membership_payments where id=p_payment for update;
 if payment.id is null or payment.status <> 'pending_verification' then raise exception 'Payment is no longer pending'; end if;
 if p_approve then
  if member.status='cancelled' then raise exception 'Cannot approve a cancelled membership'; end if;
  if payment.amount <> (case when member.member_type='outsider' and member.expires_on is null then 50 else 40 end) then raise exception 'Unexpected payment amount'; end if;
  -- Do not silently approve a registration that has become a payment for a past month.
  if payment.period_start < current_month then raise exception 'Payment month has passed. Reject with instructions to resubmit for the current month'; end if;
  if member.expires_on is not null and payment.period_start <= member.expires_on then raise exception 'This membership month is already covered'; end if;
  expiry := (payment.period_start+interval '1 month'-interval '1 day')::date;
  update public.memberships set status='active',expires_on=expiry where id=member.id;
  insert into public.membership_emails(member_id,event_key,kind,payment_id,period_start)
  values(member.id,'approved:'||payment.id,'approved',payment.id,payment.period_start);
 end if;
 if not p_approve and length(trim(coalesce(p_note,'')))=0 then raise exception 'A rejection reason is required'; end if;
 update public.membership_payments set status=case when p_approve then 'approved' else 'rejected' end,review_note=nullif(trim(p_note),''),reviewed_by=p_actor,reviewed_at=now() where id=payment.id;
 insert into public.membership_activity(member_id,event,actor_id,details) values(member.id,case when p_approve then 'payment_approved' else 'payment_rejected' end,p_actor,jsonb_build_object('payment_id',payment.id,'period',payment.period_start,'note',p_note));
end $$;

create function public.cancel_membership(p_hash text) returns void language plpgsql security invoker set search_path='' as $$
declare member public.memberships;
begin
 select * into member from public.memberships where token_hash=p_hash for update;
 if member.id is null then raise exception 'Invalid membership link'; end if;
 if member.status='cancelled' then return; end if;
 update public.memberships set status='cancelled',cancelled_at=now() where id=member.id;
 update public.membership_payments set status='rejected',review_note='Membership cancelled by member',reviewed_at=now() where member_id=member.id and status='pending_verification';
 insert into public.membership_activity(member_id,event) values(member.id,'member_cancelled');
end $$;

revoke all on function public.membership_rate_limit(text),public.register_membership(jsonb,text),public.review_membership_payment(uuid,uuid,boolean,text),public.cancel_membership(text) from public,anon,authenticated;
grant execute on function public.membership_rate_limit(text),public.register_membership(jsonb,text),public.review_membership_payment(uuid,uuid,boolean,text),public.cancel_membership(text) to service_role;

-- Track every subsequent receipt submission, including rejected-payment resubmissions.
create function public.audit_membership_receipt() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.membership_activity(member_id,event,details) values(new.member_id,'receipt_submitted',jsonb_build_object('payment_id',new.id,'period',new.period_start,'amount',new.amount,'consent_version','2026-10-16'));
 return new;
end $$;
revoke all on function public.audit_membership_receipt() from public,anon,authenticated;
grant execute on function public.audit_membership_receipt() to service_role;
create trigger membership_receipt_audit after insert on public.membership_payments for each row execute function public.audit_membership_receipt();

-- Lock the member during renewal so cancellation and receipt submission cannot race.
create function public.submit_membership_receipt(p_hash text,p_receipt text,p_period date) returns uuid language plpgsql security invoker set search_path='' as $$
declare member public.memberships; period date; pid uuid; today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
 select * into member from public.memberships where token_hash=p_hash for update;
 if member.id is null or member.status='cancelled' then raise exception 'Membership is not available for renewal'; end if;
 period := case when member.expires_on >= today then (date_trunc('month',member.expires_on)+interval '1 month')::date else date_trunc('month',today)::date end;
 if p_period <> period then raise exception 'Membership changed. Refresh before resubmitting'; end if;
 insert into public.membership_payments(member_id,kind,period_start,amount,receipt_path)
 values(member.id,case when member.expires_on is null then 'registration' else 'renewal' end,period,case when member.member_type='outsider' and member.expires_on is null then 50 else 40 end,p_receipt)
 returning id into pid;
 return pid;
end $$;
revoke all on function public.submit_membership_receipt(text,text,date) from public,anon,authenticated;
grant execute on function public.submit_membership_receipt(text,text,date) to service_role;
