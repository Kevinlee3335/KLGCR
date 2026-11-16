create table public.flex_inspection_reviews (
  period text primary key references public.flex_inspections(period),
  kevin_verified_at timestamptz,
  fikri_verified_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'uncertain')),
  recipient text,
  attempted_at timestamptz,
  sent_at timestamptz,
  claim_token uuid,
  locked_until timestamptz,
  error text,
  check (kevin_verified_at is not null or fikri_verified_at is not null),
  check (recipient is null or (kevin_verified_at is not null and fikri_verified_at is not null)),
  check (recipient is not null or status = 'pending'),
  check ((recipient is null) = (attempted_at is null)),
  check ((status = 'sent') = (sent_at is not null)),
  check ((status = 'sending') = (claim_token is not null)),
  check ((status = 'sending') = (locked_until is not null))
);

alter table public.flex_inspection_reviews enable row level security;
revoke all on public.flex_inspection_reviews from public, anon, authenticated, service_role;
grant select on public.flex_inspection_reviews to service_role;
grant insert (period, kevin_verified_at, fikri_verified_at),
  update (kevin_verified_at, fikri_verified_at, status, recipient, attempted_at,
    sent_at, claim_token, locked_until, error)
  on public.flex_inspection_reviews to service_role;

create function public.flex_inspection_reviewer(p_actor_id uuid)
returns text language sql stable security invoker set search_path = '' as $$
  select case
    when public.compliance_admin_username(p_actor_id) is null then null
    when p_actor_id = public.compliance_review_recipient('kevin') then 'kevin'
    when p_actor_id = public.compliance_review_recipient('fikri') then 'fikri'
  end;
$$;

create function public.record_flex_inspection_verification(p_period text, p_actor_id uuid)
returns public.flex_inspection_reviews language plpgsql security invoker set search_path = '' as $$
declare
  reviewer text := public.flex_inspection_reviewer(p_actor_id);
  review public.flex_inspection_reviews%rowtype;
begin
  if reviewer is null then
    raise exception 'Only Kevin or Fikri may verify a Flex inspection';
  end if;

  if not exists (
    select 1 from public.flex_inspections
    where period = p_period and completed_at is not null
  ) then
    raise exception 'Complete the Flex inspection before verification';
  end if;

  insert into public.flex_inspection_reviews as current_review (period, kevin_verified_at, fikri_verified_at)
  values (p_period,
    case when reviewer = 'kevin' then clock_timestamp() end,
    case when reviewer = 'fikri' then clock_timestamp() end)
  on conflict (period) do update set
    kevin_verified_at = coalesce(current_review.kevin_verified_at, excluded.kevin_verified_at),
    fikri_verified_at = coalesce(current_review.fikri_verified_at, excluded.fikri_verified_at)
  where (reviewer = 'kevin' and current_review.kevin_verified_at is null)
     or (reviewer = 'fikri' and current_review.fikri_verified_at is null)
  returning current_review.* into review;

  if not found then
    select * into review from public.flex_inspection_reviews where period = p_period;
  end if;
  return review;
end;
$$;

create function public.list_flex_inspections_awaiting_verification(p_actor_id uuid)
returns table (period text, inspection_date date)
language sql stable security invoker set search_path = '' as $$
  select inspection.period, inspection.inspection_date
  from public.flex_inspections inspection
  left join public.flex_inspection_reviews review on review.period = inspection.period
  where inspection.completed_at is not null
    and case public.flex_inspection_reviewer(p_actor_id)
      when 'kevin' then review.kevin_verified_at is null
      when 'fikri' then review.fikri_verified_at is null
      else false
    end
  order by inspection.period desc;
$$;

create function public.claim_flex_inspection_mail(p_period text, p_claim_token uuid, p_recipient text)
returns public.flex_inspection_reviews language sql security invoker set search_path = '' as $$
  with eligible as (
    select review.period
    from public.flex_inspection_reviews review
    join public.flex_inspections inspection on inspection.period = review.period
    where review.period = p_period
      and inspection.completed_at is not null
      and review.kevin_verified_at is not null
      and review.fikri_verified_at is not null
      and p_claim_token is not null
      and length(btrim(p_recipient)) <= 254
      and btrim(p_recipient) ~ '^[^@[:space:],;<>]+@[^@[:space:],;<>]+\.[^@[:space:],;<>]+$'
      and (review.recipient is null or review.recipient = btrim(p_recipient))
      and (review.status in ('pending', 'failed', 'uncertain')
        or (review.status = 'sending' and review.locked_until <= now()))
    for update of review skip locked
  )
  update public.flex_inspection_reviews review
  set status = 'sending', recipient = coalesce(review.recipient, btrim(p_recipient)),
      attempted_at = now(), claim_token = p_claim_token, locked_until = now() + interval '2 minutes'
  from eligible
  where review.period = eligible.period
  returning review.*;
$$;

revoke all on function public.flex_inspection_reviewer(uuid),
  public.record_flex_inspection_verification(text, uuid),
  public.list_flex_inspections_awaiting_verification(uuid),
  public.claim_flex_inspection_mail(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.flex_inspection_reviewer(uuid),
  public.record_flex_inspection_verification(text, uuid),
  public.list_flex_inspections_awaiting_verification(uuid),
  public.claim_flex_inspection_mail(text, uuid, text)
  to service_role;
