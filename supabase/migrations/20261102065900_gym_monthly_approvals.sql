create table public.gym_monthly_approvals (
 id uuid primary key default gen_random_uuid(), month date not null, kind text not null check(kind in ('committee','payments')), snapshot jsonb not null,
 notified_at timestamptz, approved_at timestamptz, approver uuid references public.profiles, signature jsonb, sent_at timestamptz,
 notice_key uuid not null default gen_random_uuid(), unique(month,kind),
 check ((approved_at is null and approver is null and signature is null and sent_at is null) or
 (approved_at is not null and approver is not null and approver='eeab5f04-30c3-42bd-a095-58e56c814358'::uuid and signature is not null))
);
alter table public.gym_monthly_approvals enable row level security;
revoke all on public.gym_monthly_approvals from anon,authenticated;
grant select,insert,update on public.gym_monthly_approvals to service_role;
create function public.queue_gym_monthly_reports() returns void language sql security invoker set search_path='' as $$
 insert into public.gym_monthly_approvals(month,kind,snapshot)
 select r.month,'committee',to_jsonb(r) from public.membership_committee_reports r
 where r.month >= date '2026-10-01' and r.month < date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')
 union all
 select m::date,'payments',coalesce((select jsonb_agg(to_jsonb(x) order by x.collected_on,x.approved_at nulls first,x.source_row nulls last,x.id)
 from (select id,collected_on,approved_at,source_row,receipt_no,full_name,member_reference,amount from public.membership_payment_ledger
 where deleted_at is null and collected_on>=m and collected_on<m+interval '1 month') x),'[]'::jsonb)
 from generate_series(timestamp '2026-10-01',date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')-interval '1 month',interval '1 month') m
 on conflict(month,kind) do nothing;
$$;
revoke all on function public.queue_gym_monthly_reports() from public,anon,authenticated;
grant execute on function public.queue_gym_monthly_reports() to service_role;