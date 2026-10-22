-- Additive: existing production approval flows continue to work until rollout.
alter table public.memberships add column member_number text check (member_number is null or (length(btrim(member_number)) between 1 and 50));
create unique index memberships_member_number_unique on public.memberships (lower(btrim(member_number))) where member_number is not null;

create function public.review_membership_payment_with_number(p_payment uuid,p_actor uuid,p_approve boolean,p_note text,p_member_number text)
returns void language plpgsql security invoker set search_path='' as $$
declare member public.memberships; payment public.membership_payments; number text:=nullif(btrim(p_member_number),'');
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then raise exception 'Admin permission required'; end if;
 select m.* into member from public.memberships m join public.membership_payments p on p.member_id=m.id where p.id=p_payment for update of m;
 select * into payment from public.membership_payments where id=p_payment for update;
 if p_approve and member.member_type='outsider' and payment.kind='registration' then
  number:=coalesce(number,member.member_number);
  if number is null or length(number)>50 then raise exception 'Member number is required (maximum 50 characters)'; end if;
 end if;
 perform public.review_membership_payment(p_payment,p_actor,p_approve,p_note);
 if p_approve and member.member_type='outsider' and payment.kind='registration' then
  update public.memberships set member_number=number where id=member.id;
  insert into public.membership_activity(member_id,event,actor_id,details) values(member.id,'member_number_assigned',p_actor,jsonb_build_object('member_number',number,'payment_id',p_payment));
 end if;
end $$;
revoke all on function public.review_membership_payment_with_number(uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.review_membership_payment_with_number(uuid,uuid,boolean,text,text) to service_role;
