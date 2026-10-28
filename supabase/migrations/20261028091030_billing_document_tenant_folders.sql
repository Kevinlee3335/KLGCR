-- Read-only archive metadata, backed by immutable saved invoice packs.
-- Security invoker preserves source-table RLS; no photos/signature data are projected.
create view public.billing_document_index with (security_invoker=true,security_barrier=true) as
select r.id as run_id,(l.ordinality-1)::integer as line_index,r.kind,r.period,r.issue_date,r.created_at,
 coalesce(nullif(l.line->>'accountId',''),'legacy:'||md5(lower(btrim(coalesce(l.line->>'name','')))||coalesce((l.line->'addr')::text,''))) as account_key,
 coalesce(l.line->>'name','Unnamed account') as account_name,
 coalesce(l.line->>'billNo','') as bill_no,
 case when jsonb_typeof(l.line->'amount')='number' then (l.line->>'amount')::numeric else 0 end as amount,
 coalesce(l.line->>'description','') as description,
 a.approved_at,a.approved_by
from public.billing_preview_runs r
cross join lateral jsonb_array_elements(case when jsonb_typeof(r.snapshot->'lines')='array' then r.snapshot->'lines' else '[]'::jsonb end) with ordinality as l(line,ordinality)
left join public.billing_run_approvals a on a.run_id=r.id and a.approved_by_user='eeab5f04-30c3-42bd-a095-58e56c814358'::uuid
where r.kind in ('rental','utility') and public.current_role()::text in ('admin','management_viewer');
revoke all on public.billing_document_index from public,anon,authenticated;
grant select on public.billing_document_index to authenticated;

create view public.billing_account_directory with (security_invoker=true,security_barrier=true) as
select 'rental'::text as kind,
 coalesce(nullif(t.account->>'id',''),'legacy:'||md5(lower(btrim(coalesce(t.account->>'name','')))||coalesce((t.account->'addr')::text,''))) as account_key,
 coalesce(t.account->>'name','Unnamed account') as account_name,
 coalesce(t.account->>'lot','') as detail
from public.billing_preview_settings s
cross join lateral jsonb_array_elements(case when jsonb_typeof(s.config->'tenants')='array' then s.config->'tenants' else '[]'::jsonb end) as t(account)
where s.id=1 and public.current_role()::text in ('admin','management_viewer')
union all
select 'utility'::text as kind,
 coalesce(nullif(t.account->>'id',''),'legacy:'||md5(lower(btrim(coalesce(t.account->>'name','')))||coalesce((t.account->'addr')::text,''))) as account_key,
 coalesce(t.account->>'name','Unnamed account') as account_name,
 coalesce(t.account->'registry'->>'unit','') as detail
from public.billing_preview_settings s
cross join lateral jsonb_array_elements(case when jsonb_typeof(s.config->'utilityAccounts')='array' then s.config->'utilityAccounts' else '[]'::jsonb end) as t(account)
where s.id=1 and public.current_role()::text in ('admin','management_viewer');
revoke all on public.billing_account_directory from public,anon,authenticated;
grant select on public.billing_account_directory to authenticated;
