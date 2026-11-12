create table public.compliance_expiry_push_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  reminder_date date not null,
  title text not null,
  body text not null,
  href text not null,
  delivered_at timestamptz,
  locked_until timestamptz,
  claim_token uuid,
  last_error text,
  unique (recipient_id, reminder_date)
);

alter table public.compliance_expiry_push_outbox enable row level security;
revoke all on public.compliance_expiry_push_outbox from public, anon, authenticated;
grant select, insert, update on public.compliance_expiry_push_outbox to service_role;
create policy compliance_expiry_service_only on public.compliance_expiry_push_outbox
  to service_role using (true) with check (true);

create index compliance_expiry_push_pending
  on public.compliance_expiry_push_outbox (reminder_date, id) where delivered_at is null;

create function public.compliance_expiry_stage(p_due_date date, p_today date) returns text
language sql immutable strict security invoker set search_path = '' as $$
  select case
    when p_due_date - p_today <= 3 then 'daily'
    when p_due_date - p_today = 15 then 'fifteen_days'
    when (p_due_date - interval '1 month')::date = p_today then 'month_before'
  end;
$$;

revoke all on function public.compliance_expiry_stage(date,date) from public, anon, authenticated, service_role;
grant execute on function public.compliance_expiry_stage(date,date) to authenticated, service_role;

create function public.compliance_expiry_follow_ups() returns table (
  cycle_id uuid,
  record_id uuid,
  title text,
  record_type text,
  location text,
  due_date date,
  days_remaining integer,
  stage text
)
language sql stable security invoker set search_path = '' as $$
  with malaysia as (select (now() at time zone 'Asia/Kuala_Lumpur')::date as today)
  select c.id, r.id, r.title, r.record_type::text, r.location, c.due_date, c.due_date - m.today, s.stage
  from public.compliance_cycles c
  join public.compliance_records r on r.id = c.record_id
  cross join malaysia m
  cross join lateral (select public.compliance_expiry_stage(c.due_date, m.today) as stage) s
  where c.status = 'open' and c.due_date <= m.today + 31 and s.stage is not null
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active and p.deleted_at is null
    )
  order by c.due_date, r.title, c.id;
$$;

revoke all on function public.compliance_expiry_follow_ups() from public, anon, authenticated, service_role;
grant execute on function public.compliance_expiry_follow_ups() to authenticated;

create function public.compliance_expiry_summary(p_today date) returns table (body text)
language sql stable security invoker set search_path = '' as $$
  with due as (
    select public.compliance_expiry_stage(c.due_date, p_today) as stage,
      c.due_date - p_today as days_remaining
    from public.compliance_cycles c
    where c.status = 'open' and c.due_date <= p_today + 31
  ), counts as (
    select count(*) as total,
      count(*) filter (where days_remaining < 0) as overdue,
      count(*) filter (where days_remaining = 0) as due_today,
      count(*) filter (where days_remaining between 1 and 3) as due_soon,
      count(*) filter (where stage = 'fifteen_days') as fifteen_days,
      count(*) filter (where stage = 'month_before') as month_before
    from due
    where stage is not null
  )
  select format('%s %s follow-up. %s.', total, case when total = 1 then 'record needs' else 'records need' end,
    concat_ws(', ',
      case when overdue > 0 then overdue || ' overdue' end,
      case when due_today > 0 then due_today || ' due today' end,
      case when due_soon > 0 then due_soon || ' due within 3 days' end,
      case when fifteen_days > 0 then fifteen_days || ' at 15 days' end,
      case when month_before > 0 then month_before || ' at one month' end
    ))
  from counts
  where total > 0;
$$;

revoke all on function public.compliance_expiry_summary(date) from public, anon, authenticated, service_role;
grant execute on function public.compliance_expiry_summary(date) to service_role;

create function public.queue_compliance_expiry_reminders() returns void
language sql security invoker set search_path = '' as $$
  with malaysia as (select (now() at time zone 'Asia/Kuala_Lumpur')::date as today),
  queued as (
    insert into public.compliance_expiry_push_outbox (recipient_id, reminder_date, title, body, href)
    select p.id, m.today, 'Cert & Servicing expiry reminders', s.body, '/admin#compliance-expiry-reminders'
    from malaysia m
    cross join lateral public.compliance_expiry_summary(m.today) s
    cross join public.profiles p
    where p.role = 'admin' and p.is_active and p.deleted_at is null
    on conflict (recipient_id, reminder_date) do nothing
    returning id, recipient_id, title, body, href
  )
  insert into public.app_notifications (id, recipient_id, type, title, body, href)
  select q.id, q.recipient_id, 'compliance_expiry', q.title, q.body, q.href
  from queued q;
$$;

revoke all on function public.queue_compliance_expiry_reminders() from public, anon, authenticated, service_role;
grant execute on function public.queue_compliance_expiry_reminders() to service_role;

create function public.claim_compliance_expiry_pushes(p_token uuid) returns table (
  id uuid,
  recipient_id uuid,
  title text,
  body text,
  href text,
  expires_at timestamptz
)
language sql security invoker set search_path = '' as $$
  with malaysia as (select (now() at time zone 'Asia/Kuala_Lumpur')::date as today),
  summary as (select s.body from malaysia m cross join lateral public.compliance_expiry_summary(m.today) s),
  candidates as (
    select o.id
    from public.compliance_expiry_push_outbox o
    join public.profiles p on p.id = o.recipient_id
    where p_token is not null and o.reminder_date = (select today from malaysia)
      and o.delivered_at is null and (o.locked_until is null or o.locked_until <= now())
      and exists (select 1 from summary)
      and p.role = 'admin' and p.is_active and p.deleted_at is null
    order by o.id
    limit 12
    for update of o skip locked
  ), claimed as (
    update public.compliance_expiry_push_outbox o
    set claim_token = p_token, locked_until = now() + interval '2 minutes', body = (select s.body from summary s)
    from candidates c where o.id = c.id
    returning o.id, o.recipient_id, o.title, o.body, o.href, o.reminder_date
  )
  select c.id, c.recipient_id, c.title, c.body, c.href,
    (c.reminder_date + 1)::timestamp at time zone 'Asia/Kuala_Lumpur'
  from claimed c;
$$;

revoke all on function public.claim_compliance_expiry_pushes(uuid) from public, anon, authenticated, service_role;
grant execute on function public.claim_compliance_expiry_pushes(uuid) to service_role;
