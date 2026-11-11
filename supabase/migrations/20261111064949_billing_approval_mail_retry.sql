alter table public.billing_mail_dispatch
  add column next_automatic_retry_at timestamptz,
  add column automatic_retry_attempts smallint not null default 0;

-- Existing dispatch rows keep a NULL date. Only new approvals enter the worker queue.
alter table public.billing_mail_dispatch
  alter column next_automatic_retry_at set default (now() + interval '5 minutes');

create index billing_mail_automatic_retry_due
  on public.billing_mail_dispatch(next_automatic_retry_at,created_at)
  where next_automatic_retry_at is not null and automatic_retry_attempts < 3 and status <> 'sent';

create function public.claim_due_billing_mail_retry() returns uuid
language plpgsql security invoker set search_path='' as $$
declare
  claimed_run_id uuid;
begin
  with due as (
    select queue.run_id
    from public.billing_mail_dispatch queue
    join public.billing_run_approvals approval on approval.run_id=queue.run_id
    where queue.next_automatic_retry_at <= now()
      and queue.automatic_retry_attempts < 3
      and queue.status <> 'sent'
      -- The approval trigger queues in the same transaction. A row created
      -- later by an explicit retry of a historical approval stays out.
      and queue.created_at <= approval.approved_at
      and (queue.status <> 'sending' or queue.attempted_at < now() - interval '2 minutes')
    order by queue.next_automatic_retry_at,queue.created_at,queue.run_id
    limit 1
    for update of queue skip locked
  )
  update public.billing_mail_dispatch queue
  set automatic_retry_attempts=queue.automatic_retry_attempts+1,
      next_automatic_retry_at=now()+interval '1 hour'
  from due
  where queue.run_id=due.run_id
  returning queue.run_id into claimed_run_id;

  return claimed_run_id;
end $$;

revoke all on function public.claim_due_billing_mail_retry() from public,anon,authenticated;
grant execute on function public.claim_due_billing_mail_retry() to service_role;
