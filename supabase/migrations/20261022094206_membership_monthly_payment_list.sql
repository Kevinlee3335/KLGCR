create table public.membership_payment_imports (
 id text primary key, source_file text not null, source_sha256 text not null,
 imported_at timestamptz not null default now(), row_count integer not null,
 months jsonb not null, issues jsonb not null default '[]'
);
create table public.membership_payment_ledger (
 id uuid primary key default gen_random_uuid(),
 payment_id uuid unique references public.membership_payments(id),
 source text not null check(source in ('system','legacy')),
 legacy_key text unique,
 collected_on date not null, approved_at timestamptz,
 full_name text not null check(length(btrim(full_name))>0),
 member_type text not null check(member_type in ('resident','outsider')),
 member_reference text not null default '',
 receipt_no text not null default '' check(receipt_no=''),
 amount numeric(12,2), kind text,
 import_id text references public.membership_payment_imports(id),
 source_row integer, source_date_raw text, source_receipt_no text,
 created_at timestamptz not null default now(),
 check((source='system' and payment_id is not null and legacy_key is null) or (source='legacy' and payment_id is null and legacy_key is not null and import_id is not null))
);
create index membership_payment_ledger_month on public.membership_payment_ledger(collected_on,approved_at,id);
alter table public.membership_payment_imports enable row level security;
alter table public.membership_payment_ledger enable row level security;
revoke all on public.membership_payment_imports,public.membership_payment_ledger from public,anon,authenticated;
grant select,insert on public.membership_payment_imports,public.membership_payment_ledger to service_role;
-- Snapshot on approval in the same transaction, without generating another payment or email.
create function public.record_membership_payment_ledger() returns trigger
language plpgsql security invoker set search_path='' as $$
declare member public.memberships;
begin
 if new.status<>'approved' or new.kind not in ('registration','renewal') or new.reviewed_at is null then return new; end if;
 if tg_op='UPDATE' and old.status='approved' then return new; end if;
 select * into member from public.memberships where id=new.member_id;
 insert into public.membership_payment_ledger(payment_id,source,collected_on,approved_at,full_name,member_type,member_reference,amount,kind)
 values(new.id,'system',(new.reviewed_at at time zone 'Asia/Kuala_Lumpur')::date,new.reviewed_at,member.full_name,member.member_type,case when member.member_type='resident' then member.room_no else coalesce(member.member_number,'') end,new.amount,new.kind)
 on conflict(payment_id) do nothing;
 return new;
end $$;
revoke all on function public.record_membership_payment_ledger() from public,anon,authenticated;
grant execute on function public.record_membership_payment_ledger() to service_role;
create trigger membership_payment_ledger_approved after insert or update of status on public.membership_payments for each row execute function public.record_membership_payment_ledger();
-- Existing approvals retain their actual approval dates. This does not change their state.
insert into public.membership_payment_ledger(payment_id,source,collected_on,approved_at,full_name,member_type,member_reference,amount,kind)
select p.id,'system',(p.reviewed_at at time zone 'Asia/Kuala_Lumpur')::date,p.reviewed_at,m.full_name,m.member_type,case when m.member_type='resident' then m.room_no else coalesce(m.member_number,'') end,p.amount,p.kind
from public.membership_payments p join public.memberships m on m.id=p.member_id where p.status='approved' and p.reviewed_at is not null and p.kind in ('registration','renewal') on conflict(payment_id) do nothing;
-- Member number must be visible to the payment approval trigger, while remaining atomic.
create or replace function public.review_membership_payment_with_number(p_payment uuid,p_actor uuid,p_approve boolean,p_note text,p_member_number text)
returns void language plpgsql security invoker set search_path='' as $$
declare member public.memberships; payment public.membership_payments; number text:=nullif(btrim(p_member_number),'');
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then raise exception 'Admin permission required'; end if;
 select m.* into member from public.memberships m join public.membership_payments p on p.member_id=m.id where p.id=p_payment for update of m;
 select * into payment from public.membership_payments where id=p_payment for update;
 if p_approve and member.member_type='outsider' and payment.kind='registration' then
  number:=coalesce(number,member.member_number);
  if number is null or length(number)>50 then raise exception 'Member number is required (maximum 50 characters)'; end if;
  update public.memberships set member_number=number where id=member.id;
 end if;
 perform public.review_membership_payment(p_payment,p_actor,p_approve,p_note);
 if p_approve and member.member_type='outsider' and payment.kind='registration' then
  insert into public.membership_activity(member_id,event,actor_id,details) values(member.id,'member_number_assigned',p_actor,jsonb_build_object('member_number',number,'payment_id',p_payment));
 end if;
end $$;
