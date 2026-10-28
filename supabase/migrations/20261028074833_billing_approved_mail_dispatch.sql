create table public.billing_mail_dispatch(
 run_id uuid primary key references public.billing_run_approvals(run_id),
 delivery_key uuid not null unique default gen_random_uuid(),
 status text not null default 'pending' check(status in ('pending','sending','sent','blocked','failed','uncertain')),
 sender text not null default 'klgcr.noreply@gmail.com' check(sender='klgcr.noreply@gmail.com'),
 recipient text not null default 'account1@keanlenggroup.com' check(recipient='account1@keanlenggroup.com'),
 cc text[] not null default array['klgcr.kevin@gmail.com','klgcr.fikri@gmail.com'] check(cc=array['klgcr.kevin@gmail.com','klgcr.fikri@gmail.com']),
 attempted_at timestamptz,sent_at timestamptz,error text,created_at timestamptz not null default now()
);
alter table public.billing_mail_dispatch enable row level security;
revoke all on public.billing_mail_dispatch from public,anon,authenticated;
grant select,insert(run_id) on public.billing_mail_dispatch to authenticated;
grant select,insert,update on public.billing_mail_dispatch to service_role;
-- These existing preview tables were originally granted to authenticated only.
-- Server dispatch needs read access; it never edits their frozen contents.
grant select on public.billing_preview_runs,public.billing_run_approvals to service_role;
create policy "billing mail read" on public.billing_mail_dispatch for select to authenticated
 using ((select public.current_role())::text in ('admin','management_viewer'));
create policy "queue James approved billing" on public.billing_mail_dispatch for insert to authenticated
 with check ((select public.is_admin()) and (select auth.uid())='eeab5f04-30c3-42bd-a095-58e56c814358'::uuid and exists(select 1 from public.billing_run_approvals a where a.run_id=billing_mail_dispatch.run_id));
create function public.queue_billing_approval_mail() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.billing_mail_dispatch(run_id) values(new.run_id) on conflict(run_id) do nothing;
 return new;
end $$;
revoke all on function public.queue_billing_approval_mail() from public,anon,authenticated;
create trigger queue_billing_approval_mail after insert on public.billing_run_approvals for each row execute function public.queue_billing_approval_mail();
