-- Monthly snapshots are insert-only. No member/payment records are modified.
create table public.membership_committee_reports (
 month date primary key check(extract(day from month)=1),
 generated_at timestamptz not null default now(), generated_by uuid references public.profiles(id),
 template_version integer not null default 1 check(template_version=1),
 entries jsonb not null, payment_count integer not null, member_count integer not null,
 total_amount numeric(12,2) not null check(total_amount>=0),
 remuneration numeric(12,2) not null check(remuneration between 0 and 3000),
 calculation_rule text not null
);
alter table public.membership_committee_reports enable row level security;
revoke all on public.membership_committee_reports from public,anon,authenticated;
grant select,insert on public.membership_committee_reports to service_role;
create function public.save_membership_committee_report(p_month date,p_actor uuid default null)
returns date language plpgsql security invoker set search_path='' as $$
declare items jsonb; total numeric; payments integer; members integer; start_at timestamptz; end_at timestamptz;
begin
 if p_actor is not null and not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then raise exception 'Admin permission required'; end if;
 if p_month is null or extract(day from p_month)<>1 or p_month>=date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'Choose a completed calendar month'; end if;
 -- Approval time is the confirmed collection date; use MYT half-open boundaries.
 start_at:=p_month::timestamp at time zone 'Asia/Kuala_Lumpur';
 end_at:=(p_month+interval '1 month')::timestamp at time zone 'Asia/Kuala_Lumpur';
 with collected as (
  select p.id,p.member_id,m.full_name,p.kind,p.amount,p.reviewed_at,p.period_start
  from public.membership_payments p join public.memberships m on m.id=p.member_id
  where p.status='approved' and p.kind in ('registration','renewal') and p.reviewed_at>=start_at and p.reviewed_at<end_at
 ), grouped as (
  select member_id,full_name,sum(amount) amount,jsonb_agg(jsonb_build_object('id',id,'kind',kind,'amount',amount,'approved_at',reviewed_at,'membership_month',period_start) order by reviewed_at,id) payments
  from collected group by member_id,full_name
 ) select coalesce(jsonb_agg(jsonb_build_object('member_id',member_id,'full_name',full_name,'amount',amount,'payments',g.payments) order by lower(full_name),member_id),'[]'::jsonb),coalesce(sum(amount),0),coalesce(sum(jsonb_array_length(g.payments)),0)::integer,count(*)::integer into items,total,payments,members from grouped g;
 insert into public.membership_committee_reports(month,generated_by,entries,payment_count,member_count,total_amount,remuneration,calculation_rule)
 values(p_month,p_actor,items,payments,members,total,case when total<1000 then 500 else least(round(total*0.40,2),3000) end,'Below RM1,000: RM500; RM1,000 and above: 40%; maximum RM3,000. Access Card deposits excluded.')
 on conflict(month) do nothing;
 return p_month;
end $$;
revoke all on function public.save_membership_committee_report(date,uuid) from public,anon,authenticated;
grant execute on function public.save_membership_committee_report(date,uuid) to service_role;
create function public.generate_due_membership_committee_reports() returns integer
language plpgsql security invoker set search_path='' as $$
declare day date:=(now() at time zone 'Asia/Kuala_Lumpur')::date; last_month date; first_month date; period date; generated integer:=0;
begin
 last_month:=(date_trunc('month',day)-case when extract(day from day)>=7 then interval '1 month' else interval '2 months' end)::date;
 select date_trunc('month',min(reviewed_at) at time zone 'Asia/Kuala_Lumpur')::date into first_month from public.membership_payments where status='approved';
 if first_month is null then return 0; end if;
 for period in select d::date from generate_series(first_month,last_month,interval '1 month') d loop
  if not exists(select 1 from public.membership_committee_reports where month=period) then
   perform public.save_membership_committee_report(period,null); generated:=generated+1;
  end if;
 end loop;
 return generated;
end $$;
revoke all on function public.generate_due_membership_committee_reports() from public,anon,authenticated;
grant execute on function public.generate_due_membership_committee_reports() to service_role;
