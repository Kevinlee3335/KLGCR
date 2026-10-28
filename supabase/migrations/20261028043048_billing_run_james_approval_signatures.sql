-- Invoice packs are immutable. Their approval signature is a separate immutable snapshot.
create table public.billing_run_approvals(
 run_id uuid primary key references public.billing_preview_runs(id),
 approved_by_user uuid not null references public.profiles(id),
 approved_by text not null,
 approved_at timestamptz not null,
 signature jsonb not null
);
alter table public.billing_run_approvals enable row level security;
revoke all on public.billing_run_approvals from public,anon,authenticated;
grant select,insert(run_id) on public.billing_run_approvals to authenticated;
grant select on public.billing_run_approvals to service_role;
create policy "billing approval read" on public.billing_run_approvals for select to authenticated
 using ((select public.current_role())::text in ('admin','management_viewer'));
create policy "James approves billing" on public.billing_run_approvals for insert to authenticated
 with check ((select public.is_admin()) and (select auth.uid())='eeab5f04-30c3-42bd-a095-58e56c814358'::uuid);
create function public.stamp_billing_approval() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is distinct from 'eeab5f04-30c3-42bd-a095-58e56c814358'::uuid or not public.is_admin() then raise exception 'Only James can approve billing';end if;
 if not exists(select 1 from public.billing_preview_runs where id=new.run_id and jsonb_typeof(snapshot->'lines')='array' and jsonb_array_length(snapshot->'lines')>0) then raise exception 'Review a saved nonempty invoice pack first';end if;
 select signature into new.signature from public.user_e_signatures where user_id=auth.uid();
 if new.signature is null then raise exception 'Save your signature before approving';end if;
 select full_name into new.approved_by from public.profiles where id=auth.uid() and is_active and deleted_at is null;
 if new.approved_by is null then raise exception 'Active approver required';end if;
 new.approved_by_user:=auth.uid();new.approved_at:=clock_timestamp();return new;
end $$;
revoke all on function public.stamp_billing_approval() from public,anon,authenticated;
create trigger stamp_billing_approval before insert on public.billing_run_approvals for each row execute function public.stamp_billing_approval();
create function public.approve_billing_run(billing_run_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.billing_run_approvals;
begin
 if auth.uid() is distinct from 'eeab5f04-30c3-42bd-a095-58e56c814358'::uuid or not public.is_admin() then raise exception 'Only James can approve billing';end if;
 -- Lock the immutable pack, serialize repeated clicks, and keep the first approval signature.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(billing_run_id::text,0));
 select * into saved from public.billing_run_approvals where run_id=billing_run_id;
 if found then return to_jsonb(saved);end if;
 insert into public.billing_run_approvals(run_id) values(billing_run_id) returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function public.approve_billing_run(uuid) from public,anon;
grant execute on function public.approve_billing_run(uuid) to authenticated;
