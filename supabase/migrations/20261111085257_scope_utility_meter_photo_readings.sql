-- Keep OCR status separate from billing data so polling can read one run by ID.
create table public.utility_meter_photo_readings (
  period text not null,
  account_id text not null,
  meter_id text not null,
  run_id uuid not null,
  capture_revision integer not null,
  revision integer not null,
  status text not null check (status in ('pending', 'read', 'manual', 'unavailable', 'superseded')),
  reading numeric,
  primary key (period, account_id, meter_id)
);

alter table public.utility_meter_photo_readings enable row level security;
revoke all on public.utility_meter_photo_readings from public, anon, authenticated;
grant select, insert, update on public.utility_meter_photo_readings to service_role;

-- List only utilities and include photos exclusively for the requested account/meter.
create function public.get_utility_meter_photos(p_account_id text, p_meter_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'period', s.config->>'utilityPeriod',
    'revision', s.revision,
    'utilityAccounts', coalesce((
      select jsonb_agg(jsonb_set(account.value, '{meters}', coalesce((
        select jsonb_agg(
          case when account.value->>'id' = p_account_id
            and (p_meter_id is null or meter.value->>'id' = p_meter_id)
          then meter.value else meter.value - 'photo' - 'previousPhoto' end
          order by meter.ordinality
        )
        from jsonb_array_elements(account.value->'meters') with ordinality as meter
      ), '[]'::jsonb)) order by account.ordinality)
      from jsonb_array_elements(s.config->'utilityAccounts') with ordinality as account
    ), '[]'::jsonb)
  )
  from public.billing_preview_settings s where s.id = 1;
$$;

create function public.save_utility_meter_photo(
  p_period text, p_revision integer, p_account_id text, p_meter_id text,
  p_photo text, p_capture_date text, p_user_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  settings_config jsonb;
  settings_revision integer;
  account jsonb;
  account_index bigint;
  meter jsonb;
  meter_index bigint;
  baseline_meter jsonb;
  meter_path text[];
  new_run_id uuid := gen_random_uuid();
  meter_query_vars jsonb := jsonb_build_object('account', p_account_id, 'meter', p_meter_id);
begin
  select config, revision into strict settings_config, settings_revision
  from public.billing_preview_settings where id = 1 for update;

  if settings_config->>'utilityPeriod' is distinct from p_period then
    return jsonb_build_object('status', 'month_changed');
  end if;

  select value, ordinality - 1 into account, account_index
  from jsonb_array_elements(settings_config->'utilityAccounts') with ordinality
  where value->>'id' = p_account_id limit 1;

  if account is null or p_period < account->>'first' or (
    account ? 'termination' and p_period > case
      when right(account#>>'{termination,date}', 3) = '-01' then left(account#>>'{termination,date}', 7)
      else to_char(date_trunc('month', (account#>>'{termination,date}')::date::timestamp) + interval '1 month', 'YYYY-MM')
    end
  ) then
    return jsonb_build_object('status', 'meter_missing');
  end if;

  select value, ordinality - 1 into meter, meter_index
  from jsonb_array_elements(account->'meters') with ordinality
  where value->>'id' = p_meter_id limit 1;

  if meter is null then
    return jsonb_build_object('status', 'meter_missing');
  end if;

  -- The caller's displayed revision may be old after an unrelated Admin or Faiz edit.
  -- Compare the target meter in that revision while holding the current settings lock.
  if p_revision is distinct from settings_revision then
    select jsonb_path_query_first(config, '$.utilityAccounts[*] ? (@.id == $account).meters[*] ? (@.id == $meter)', meter_query_vars)
    into baseline_meter from public.utility_reading_revisions
    where revision = p_revision and config->>'utilityPeriod' = p_period;

    if baseline_meter is null then
      return jsonb_build_object('status', 'stale_revision');
    end if;

    if baseline_meter is distinct from meter or exists (
      select 1 from public.utility_meter_photo_readings
      where period = p_period and account_id = p_account_id and meter_id = p_meter_id
      and capture_revision > p_revision
    ) then
      return jsonb_build_object('status', 'meter_changed');
    end if;
  end if;

  meter_path := array['utilityAccounts', account_index::text, 'meters', meter_index::text];
  meter := meter || jsonb_build_object('photo', p_photo, 'currentDate', p_capture_date, 'curr', null, 'confirmed', false);
  update public.billing_preview_settings
  set config = jsonb_set(config, meter_path, meter), revision = revision + 1,
      updated_by = p_user_id, updated_at = now()
  where id = 1 returning revision into settings_revision;

  insert into public.utility_meter_photo_readings (period, account_id, meter_id, run_id, capture_revision, revision, status)
  values (p_period, p_account_id, p_meter_id, new_run_id, settings_revision, settings_revision, 'pending')
  on conflict (period, account_id, meter_id) do update
  set run_id = excluded.run_id, capture_revision = excluded.capture_revision,
      revision = excluded.revision, status = 'pending', reading = null;

  return jsonb_build_object('status', 'saved', 'period', p_period, 'revision', settings_revision,
                            'runId', new_run_id, 'meter', meter - 'photo' - 'previousPhoto');
end;
$$;

create function public.finish_utility_meter_photo_reading(
  p_period text, p_account_id text, p_meter_id text, p_run_id uuid,
  p_status text, p_reading numeric, p_user_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  settings_config jsonb;
  settings_revision integer;
  capture public.utility_meter_photo_readings%rowtype;
  saved_meter jsonb;
  current_meter jsonb;
  meter_path text[];
  outcome text := p_status;
  meter_query_vars jsonb := jsonb_build_object('account', p_account_id, 'meter', p_meter_id);
begin
  -- Use the same lock order as photo capture. An older run cannot update a replacement.
  select config, revision into strict settings_config, settings_revision
  from public.billing_preview_settings where id = 1 for update;

  select * into capture from public.utility_meter_photo_readings
  where period = p_period and account_id = p_account_id and meter_id = p_meter_id and run_id = p_run_id;

  if capture.run_id is null then
    return jsonb_build_object('status', 'superseded');
  end if;
  if capture.status <> 'pending' then
    return jsonb_build_object('status', capture.status, 'revision', capture.revision, 'reading', capture.reading);
  end if;

  select meter.value, array['utilityAccounts', (account.ordinality - 1)::text, 'meters', (meter.ordinality - 1)::text]
  into current_meter, meter_path
  from jsonb_array_elements(settings_config->'utilityAccounts') with ordinality as account
  cross join lateral jsonb_array_elements(account.value->'meters') with ordinality as meter
  where account.value->>'id' = p_account_id and meter.value->>'id' = p_meter_id limit 1;

  select jsonb_path_query_first(config, '$.utilityAccounts[*] ? (@.id == $account).meters[*] ? (@.id == $meter)', meter_query_vars)
  into saved_meter from public.utility_reading_revisions where revision = capture.capture_revision;

  if settings_config->>'utilityPeriod' is distinct from p_period or current_meter is null
    or current_meter is distinct from saved_meter then
    outcome := 'superseded';
  elsif p_status = 'read' and p_reading between coalesce((current_meter->>'prev')::numeric, 0) and 1000000000
    and p_reading = trunc(p_reading) then
    update public.billing_preview_settings
    set config = jsonb_set(config, meter_path, current_meter || jsonb_build_object('curr', p_reading, 'confirmed', false)),
        revision = revision + 1, updated_by = p_user_id, updated_at = now()
    where id = 1 returning revision into settings_revision;
  elsif p_status = 'unavailable' then
    outcome := 'unavailable';
  else
    outcome := 'manual';
  end if;

  update public.utility_meter_photo_readings
  set status = outcome, reading = case when outcome = 'read' then p_reading end,
      revision = settings_revision
  where period = p_period and account_id = p_account_id and meter_id = p_meter_id and run_id = p_run_id;

  return jsonb_build_object('status', outcome, 'revision', settings_revision,
                            'reading', case when outcome = 'read' then p_reading end);
end;
$$;

-- Pending polls read only the exact run. On completion, reconcile only its meter
-- so an Admin correction or retake made before the next poll appears immediately.
create function public.get_utility_meter_photo_reading(
  p_period text, p_account_id text, p_meter_id text, p_run_id uuid
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  capture public.utility_meter_photo_readings%rowtype;
  settings_revision integer;
  current_meter jsonb;
  expected_meter jsonb;
  photos_changed boolean;
  meter_query constant jsonpath := '$.utilityAccounts[*] ? (@.id == $account).meters[*] ? (@.id == $meter)';
  meter_query_vars jsonb := jsonb_build_object('account', p_account_id, 'meter', p_meter_id);
begin
  select * into capture from public.utility_meter_photo_readings
  where period = p_period and account_id = p_account_id and meter_id = p_meter_id and run_id = p_run_id;
  if capture.run_id is null then
    return jsonb_build_object('status', 'superseded');
  end if;
  if capture.status = 'pending' then
    return jsonb_build_object('status', 'pending', 'revision', capture.revision);
  end if;

  select revision, jsonb_path_query_first(config, meter_query, meter_query_vars)
  into settings_revision, current_meter from public.billing_preview_settings
  where id = 1 and config->>'utilityPeriod' = p_period;
  if current_meter is null then
    return jsonb_build_object('status', 'superseded');
  end if;

  select jsonb_path_query_first(config, meter_query, meter_query_vars)
  into expected_meter from public.utility_reading_revisions where revision = capture.capture_revision;
  if capture.status in ('read', 'manual', 'unavailable') then
    if capture.status = 'read' then
      expected_meter := expected_meter || jsonb_build_object('curr', capture.reading, 'confirmed', false);
    end if;
    if current_meter = expected_meter then
      return jsonb_build_object('status', capture.status, 'revision', settings_revision, 'reading', capture.reading);
    end if;
  end if;

  photos_changed := current_meter->'photo' is distinct from expected_meter->'photo'
    or current_meter->'previousPhoto' is distinct from expected_meter->'previousPhoto';
  return jsonb_build_object('status', 'superseded', 'revision', settings_revision,
    'replacePhotos', photos_changed, 'meter', case when photos_changed then current_meter
      else current_meter - 'photo' - 'previousPhoto' end);
end;
$$;

revoke all on function public.get_utility_meter_photos(text, text) from public, anon, authenticated;
revoke all on function public.save_utility_meter_photo(text, integer, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.finish_utility_meter_photo_reading(text, text, text, uuid, text, numeric, uuid) from public, anon, authenticated;
grant execute on function public.get_utility_meter_photos(text, text) to service_role;
grant execute on function public.save_utility_meter_photo(text, integer, text, text, text, text, uuid) to service_role;
grant execute on function public.finish_utility_meter_photo_reading(text, text, text, uuid, text, numeric, uuid) to service_role;
revoke all on function public.get_utility_meter_photo_reading(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.get_utility_meter_photo_reading(text, text, text, uuid) to service_role;
