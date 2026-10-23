alter table public.membership_payment_ledger
 add column deleted_at timestamptz,
 add column deleted_by uuid references public.profiles(id);
create function public.delete_membership_payment_list_entry(p_ledger uuid,p_actor uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then raise exception 'Admin permission required'; end if;
 update public.membership_payment_ledger set deleted_at=now(),deleted_by=p_actor where id=p_ledger and deleted_at is null;
 if not found and not exists(select 1 from public.membership_payment_ledger where id=p_ledger and deleted_at is not null) then raise exception 'Payment entry not found'; end if;
end $$;
revoke all on function public.delete_membership_payment_list_entry(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_membership_payment_list_entry(uuid,uuid) to service_role;
grant update(deleted_at,deleted_by) on public.membership_payment_ledger to service_role;
create or replace function public.preview_membership_committee_report(p_month date) returns jsonb
language sql stable security invoker set search_path='' as $$
 with source_entries as (
 select e from public.membership_committee_sources s cross join lateral jsonb_array_elements(s.entries) e where s.month=p_month and not exists (
 select 1 from public.membership_payment_ledger l where l.source='legacy' and l.deleted_at is not null
 and l.collected_on>=p_month and l.collected_on<(p_month+interval '1 month')
 and lower(regexp_replace(btrim(l.full_name),'\s+',' ','g'))=lower(regexp_replace(btrim(e->>'full_name'),'\s+',' ','g'))
 )
 ), system_entries as (
 select jsonb_build_object('member_id',m.id,'full_name',m.full_name,'amount',sum(p.amount),'payments',jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,'amount',p.amount,'approved_at',p.reviewed_at,'membership_month',p.period_start) order by p.reviewed_at,p.id)) e
 from public.membership_payments p join public.memberships m on m.id=p.member_id
 where not exists(select 1 from public.membership_payment_ledger l where l.payment_id=p.id and l.deleted_at is not null) and p.status='approved' and p.kind in ('registration','renewal')
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
