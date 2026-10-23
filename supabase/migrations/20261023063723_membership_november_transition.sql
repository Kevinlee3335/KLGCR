alter table public.memberships add column starts_on date;
create function public.membership_registration_period(p_submitted_at timestamptz) returns date
language sql immutable security invoker set search_path='' as $$
 select case when (p_submitted_at at time zone 'Asia/Kuala_Lumpur')::date between date '2026-10-23' and date '2026-10-31'
 then date '2026-11-01' else date_trunc('month',p_submitted_at at time zone 'Asia/Kuala_Lumpur')::date end;
$$;
revoke all on function public.membership_registration_period(timestamptz) from public,anon,authenticated;
grant execute on function public.membership_registration_period(timestamptz) to service_role;
CREATE OR REPLACE FUNCTION public.register_membership(p_member jsonb, p_receipt text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare mid uuid := (p_member->>'id')::uuid; period date := public.membership_registration_period(now());
begin
 if coalesce(p_member->>'declaration_accepted','false')<>'true'
 or p_member->>'declaration_version' is distinct from '2026-10-17-v1'
 or jsonb_typeof(p_member->'declaration_clauses') is distinct from 'array'
 then raise exception 'Membership declaration acceptance required'; end if;
 if jsonb_array_length(p_member->'declaration_clauses')<>4 then raise exception 'Four declaration clauses required'; end if;
 insert into public.memberships(id,full_name,email,member_type,id_type,identification,gender,nationality,room_no,student_id,address,token_hash,token_ciphertext,photo_path,emergency_contact,emergency_relationship,access_card_path)
 values(mid,p_member->>'full_name',lower(p_member->>'email'),p_member->>'member_type',p_member->>'id_type',p_member->>'identification',p_member->>'gender',p_member->>'nationality',p_member->>'room_no',p_member->>'student_id',p_member->>'address',p_member->>'token_hash',p_member->>'token_ciphertext',p_member->>'photo_path',p_member->>'emergency_contact',p_member->>'emergency_relationship',p_member->>'access_card_path');
 insert into public.membership_payments(member_id,kind,period_start,amount,receipt_path)
 values(mid,'registration',period,40,p_receipt);
 insert into public.membership_activity(member_id,event) values(mid,'registration_submitted');
 insert into public.membership_emails(member_id,event_key,kind,period_start)
 values(mid,'registered:'||mid,'registered',period);
 insert into public.membership_activity(member_id,event,details)
 values(mid,'rules_accepted',jsonb_build_object('version',p_member->>'declaration_version','clauses',p_member->'declaration_clauses'));
 return mid;
end $function$;

CREATE OR REPLACE FUNCTION public.review_membership_payment(p_payment uuid, p_actor uuid, p_approve boolean, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare payment public.membership_payments; member public.memberships; expiry date; current_month date := date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then raise exception 'Admin permission required'; end if;
 -- Consistent lock order: member, then payments. Cancellation uses the same order.
 select m.* into member from public.memberships m join public.membership_payments p on p.member_id=m.id where p.id=p_payment for update of m;
 select * into payment from public.membership_payments where id=p_payment for update;
 if payment.id is null or payment.status <> 'pending_verification' then raise exception 'Payment is no longer pending'; end if;
 if p_approve then
  if member.status in ('cancelled','suspended') then raise exception 'Cannot approve a cancelled membership'; end if;
  if payment.amount <> (40) then raise exception 'Unexpected payment amount'; end if;
  -- Do not silently approve a registration that has become a payment for a past month.
  if payment.period_start < current_month then raise exception 'Payment month has passed. Reject with instructions to resubmit for the current month'; end if;
  if member.expires_on is not null and payment.period_start <= member.expires_on then raise exception 'This membership month is already covered'; end if;
  expiry := (payment.period_start+interval '1 month'-interval '1 day')::date;
  update public.memberships set status='active',expires_on=expiry,starts_on=case when payment.kind='registration' then payment.period_start else coalesce(starts_on,payment.period_start) end where id=member.id;
  insert into public.membership_emails(member_id,event_key,kind,payment_id,period_start)
  values(member.id,'approved:'||payment.id,'approved',payment.id,payment.period_start);
 end if;
 if not p_approve and length(trim(coalesce(p_note,'')))=0 then raise exception 'A rejection reason is required'; end if;
 update public.membership_payments set status=case when p_approve then 'approved' else 'rejected' end,review_note=nullif(trim(p_note),''),reviewed_by=p_actor,reviewed_at=now() where id=payment.id;
 insert into public.membership_activity(member_id,event,actor_id,details) values(member.id,case when p_approve then 'payment_approved' else 'payment_rejected' end,p_actor,jsonb_build_object('payment_id',payment.id,'period',payment.period_start,'note',p_note));
end $function$;


