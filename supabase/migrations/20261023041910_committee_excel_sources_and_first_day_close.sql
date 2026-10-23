create table public.membership_committee_sources (
 month date primary key check(extract(day from month)=1), entries jsonb not null,
 source_file text not null, source_sha256 text not null, imported_at timestamptz not null default now()
);
alter table public.membership_committee_sources enable row level security;
revoke all on public.membership_committee_sources from public,anon,authenticated;
grant select,insert on public.membership_committee_sources to service_role;
create function public.preview_membership_committee_report(p_month date) returns jsonb
language sql stable security invoker set search_path='' as $$
 with source_entries as (
 select e from public.membership_committee_sources s cross join lateral jsonb_array_elements(s.entries) e where s.month=p_month
 ), system_entries as (
 select jsonb_build_object('member_id',m.id,'full_name',m.full_name,'amount',sum(p.amount),'payments',jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,'amount',p.amount,'approved_at',p.reviewed_at,'membership_month',p.period_start) order by p.reviewed_at,p.id)) e
 from public.membership_payments p join public.memberships m on m.id=p.member_id
 where p.status='approved' and p.kind in ('registration','renewal')
 and p.reviewed_at >= (p_month::timestamp at time zone 'Asia/Kuala_Lumpur')
 and p.reviewed_at < ((p_month+interval '1 month')::timestamp at time zone 'Asia/Kuala_Lumpur')
 group by m.id,m.full_name
 ), all_entries as (select e from source_entries union all select e from system_entries),
 grouped as (
 select min(e->>'member_id') member_id,min(e->>'full_name') full_name,sum((e->>'amount')::numeric) amount,
 jsonb_path_query_array(jsonb_agg(e),'$[*].payments[*]') payments,
 sum(case when jsonb_array_length(e->'payments')=0 then 1 else jsonb_array_length(e->'payments') end) payment_count
 from all_entries group by lower(regexp_replace(btrim(e->>'full_name'),'\s+',' ','g'))
 ), totals as (
 select coalesce(jsonb_agg(jsonb_build_object('member_id',member_id,'full_name',full_name,'amount',amount,'payments',payments) order by lower(full_name)),'[]'::jsonb) entries,
 coalesce(sum(amount),0) total,count(*) member_count,coalesce(sum(payment_count),0) payment_count from grouped
 ) select jsonb_build_object('month',p_month,'generated_at',now(),'template_version',1,'entries',entries,'payment_count',payment_count,'member_count',member_count,'total_amount',total,'remuneration',case when total<1000 then 500 else least(round(total*0.4,2),3000) end,'calculation_rule','Below RM1,000: RM500; RM1,000 and above: 40%; maximum RM3,000. Access Card deposits excluded.') from totals;
$$;
revoke all on function public.preview_membership_committee_report(date) from public,anon,authenticated;
grant execute on function public.preview_membership_committee_report(date) to service_role;
create or replace function public.save_membership_committee_report(p_month date,p_actor uuid default null)
returns date language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
 if p_actor is not null and not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then raise exception 'Admin permission required'; end if;
 if p_month is null or extract(day from p_month)<>1 or p_month>=date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'Choose a completed calendar month'; end if;
 r:=public.preview_membership_committee_report(p_month);
 insert into public.membership_committee_reports(month,generated_by,entries,payment_count,member_count,total_amount,remuneration,calculation_rule)
 values(p_month,p_actor,r->'entries',(r->>'payment_count')::int,(r->>'member_count')::int,(r->>'total_amount')::numeric,(r->>'remuneration')::numeric,r->>'calculation_rule') on conflict(month) do nothing;
 return p_month;
end $$;
create or replace function public.generate_due_membership_committee_reports() returns integer
language plpgsql security invoker set search_path='' as $$
declare period date; first_month date; generated integer:=0;
begin
 select min(m) into first_month from (
 select min(month) m from public.membership_committee_sources
 union all select date_trunc('month',min(reviewed_at) at time zone 'Asia/Kuala_Lumpur')::date from public.membership_payments where status='approved' and kind in ('registration','renewal')
 ) starts;
 if first_month is null then return 0; end if;
 for period in select d::date from generate_series(first_month,date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')-interval '1 month',interval '1 month') d loop
 if not exists(select 1 from public.membership_committee_reports where month=period) then perform public.save_membership_committee_report(period,null); generated:=generated+1; end if;
 end loop;
 return generated;
end $$;
