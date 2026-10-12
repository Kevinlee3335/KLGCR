create table public.phone_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  events jsonb not null default '{}'::jsonb check (jsonb_typeof(events) = 'object'),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index phone_notification_preferences_updated_by_idx on public.phone_notification_preferences(updated_by);
alter table public.phone_notification_preferences enable row level security;
grant select, insert, update on public.phone_notification_preferences to authenticated;
grant all on public.phone_notification_preferences to service_role;
create policy "admins read phone preferences" on public.phone_notification_preferences for select to authenticated using ((select public.is_admin()));
create policy "admins insert phone preferences" on public.phone_notification_preferences for insert to authenticated with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy "admins update phone preferences" on public.phone_notification_preferences for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()) and updated_by = (select auth.uid()));

create table public.integration_sync_health (
  source text not null check (source in ('google_form','inventory')),
  scope text not null,
  failed boolean not null,
  detail text not null,
  updated_at timestamptz not null default now(),
  primary key (source, scope)
);
alter table public.integration_sync_health enable row level security;
grant select on public.integration_sync_health to authenticated;
grant all on public.integration_sync_health to service_role;
create policy "admins read sync health" on public.integration_sync_health for select to authenticated using ((select public.is_admin()));

-- Service-only, atomic transition + bell records. Advisory lock deduplicates concurrent retries.
create function public.record_integration_sync(p_source text, p_scope text, p_failed boolean, p_detail text)
returns table (recipient_id uuid, notification_type text, notification_title text, notification_body text)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare previous_failed boolean; event_type text; event_title text; event_body text;
begin
  if p_source not in ('google_form','inventory') or length(p_scope) > 200 then raise exception 'Invalid sync source'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_source || ':' || p_scope, 0));
  select failed into previous_failed from public.integration_sync_health where source=p_source and scope=p_scope;
  -- Healthy first observations need no stored row. A recovery refers to this exact failed item/submission.
  if previous_failed is null and not p_failed then return; end if;
  insert into public.integration_sync_health(source,scope,failed,detail) values(p_source,p_scope,p_failed,left(p_detail,240))
  on conflict(source,scope) do update set failed=excluded.failed,detail=excluded.detail,updated_at=now();
  if previous_failed is not distinct from p_failed then return; end if;
  event_type := case when p_source='google_form' then 'google_form_sync_' else 'inventory_sync_' end || case when p_failed then 'failed' else 'recovered' end;
  event_title := case when p_source='google_form' then 'Google Form' else 'Inventory' end || case when p_failed then ' sync failed' else ' sync recovered' end;
  event_body := left(p_scope,160) || ' · ' || to_char(now() at time zone 'Asia/Kuala_Lumpur','DD Mon YYYY HH24:MI') || ' MYT · ' || left(p_detail,240);
  return query
  insert into public.app_notifications(recipient_id,type,title,body,href)
  select p.id,event_type,event_title,event_body,'/admin/settings'
  from public.profiles p where p.role in ('admin','management_viewer') and p.is_active and p.deleted_at is null
  returning app_notifications.recipient_id,event_type,event_title,event_body;
end; $$;
revoke all on function public.record_integration_sync(text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.record_integration_sync(text,text,boolean,text) to service_role;
