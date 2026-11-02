-- Keep raw revisions so a replacement photo can always be recovered.
create table public.utility_reading_revisions (
 revision integer primary key,
 config jsonb not null,
 saved_at timestamptz not null default now()
);
create table public.utility_reading_months (
 period text primary key check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 config jsonb not null,
 saved_at timestamptz not null default now()
);
alter table public.utility_reading_revisions enable row level security;
alter table public.utility_reading_months enable row level security;
revoke all on public.utility_reading_revisions,public.utility_reading_months from anon,authenticated;
grant select on public.utility_reading_months to authenticated;
grant all on public.utility_reading_revisions,public.utility_reading_months to service_role;
create policy utility_months_admin_read on public.utility_reading_months for select to authenticated
 using (public.current_role() in ('admin','management_viewer'));

create function public.archive_utility_readings() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  insert into public.utility_reading_revisions(revision,config) values(old.revision,old.config) on conflict do nothing;
  if new.config->>'utilityPeriod' < old.config->>'utilityPeriod' then
   raise exception 'Utility month cannot move backwards. Reload readings.';
  end if;
 end if;
 insert into public.utility_reading_revisions(revision,config) values(new.revision,new.config) on conflict do nothing;
 insert into public.utility_reading_months(period,config) values(new.config->>'utilityPeriod',new.config)
 on conflict(period) do update set config=excluded.config,saved_at=now();
 return new;
end $$;
revoke all on function public.archive_utility_readings() from public,anon,authenticated;
create trigger archive_utility_readings after insert or update on public.billing_preview_settings
 for each row execute function public.archive_utility_readings();
insert into public.utility_reading_revisions(revision,config) select revision,config from public.billing_preview_settings;
insert into public.utility_reading_months(period,config) select config->>'utilityPeriod',config from public.billing_preview_settings;

-- Row lock makes rollover atomic with Faiz uploads and Admin edits.
-- Existing new-month photos remain on the right. Missing historical readings
-- stay null, rather than reusing a two-month-old reading and overbilling.
create function public.ensure_utility_month() returns void
language plpgsql security definer set search_path='' as $$
declare s public.billing_preview_settings%rowtype;
 target text := to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYY-MM');
 p text; nxt text; ac jsonb; m jsonb; oldaccounts jsonb; newaccounts jsonb;
 oldmeters jsonb; newmeters jsonb; oldm jsonb; newm jsonb; oldac jsonb;
begin
 select * into s from public.billing_preview_settings where id=1 for update;
 if not found then raise exception 'Billing settings unavailable'; end if;
 while s.config->>'utilityPeriod' < target loop
  p:=s.config->>'utilityPeriod';
  nxt:=to_char((p||'-01')::date + interval '1 month','YYYY-MM');
  oldaccounts:='[]';newaccounts:='[]';
  for ac in select value from jsonb_array_elements(s.config->'utilityAccounts') loop
   oldmeters:='[]';newmeters:='[]';
   for m in select value from jsonb_array_elements(ac->'meters') loop
    oldm:=m;newm:=m;
    if coalesce(m->>'currentDate',p||'-01') < nxt||'-01' then
     -- The saved current reading belongs to the closing month.
     newm:=(m - 'photo' - 'previousPhoto') || jsonb_build_object(
      'prev',m->'curr','curr',null,'confirmed',false,
      'previousDate',coalesce(m->>'currentDate',p||'-01'),'currentDate',nxt||'-01');
     if m ? 'photo' then newm:=newm||jsonb_build_object('previousPhoto',m->'photo');end if;
    else
     -- A photo was uploaded after midnight before the old client rolled over.
     -- Recover October from the previous slot only when its date proves it.
     oldm:=(m - 'photo')||jsonb_build_object('curr',null,'confirmed',false,'currentDate',p||'-01');
     if left(coalesce(m->>'previousDate',''),7)=p then
      oldm:=oldm||jsonb_build_object('curr',m->'prev');
      if m ? 'previousPhoto' then oldm:=oldm||jsonb_build_object('photo',m->'previousPhoto');end if;
      oldm:=oldm-'previousPhoto'||jsonb_build_object('prev',null);
      newm:=m;
     else
      newm:=(m-'previousPhoto')||jsonb_build_object('prev',null,'previousDate',p||'-01');
     end if;
    end if;
    oldmeters:=oldmeters||jsonb_build_array(oldm);
    newmeters:=newmeters||jsonb_build_array(newm);
   end loop;
   oldac:=jsonb_set(ac,'{meters}',oldmeters);
   oldaccounts:=oldaccounts||jsonb_build_array(oldac);
   newaccounts:=newaccounts||jsonb_build_array(jsonb_set(ac,'{meters}',newmeters));
  end loop;
  insert into public.utility_reading_months(period,config)
   values(p,jsonb_set(s.config,'{utilityAccounts}',oldaccounts))
   on conflict(period) do update set config=excluded.config,saved_at=now();
  s.config:=jsonb_set(jsonb_set(s.config,'{utilityAccounts}',newaccounts),'{utilityPeriod}',to_jsonb(nxt));
  update public.billing_preview_settings set config=s.config,revision=revision+1,updated_at=now()
   where id=1 returning * into s;
 end loop;
end $$;
revoke all on function public.ensure_utility_month() from public,anon,authenticated;
grant execute on function public.ensure_utility_month() to service_role;

-- Runs at 00:05 Malaysia daily, including the first day of each month.
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('utility-month-rollover','5 16 * * *','select public.ensure_utility_month()');
 end if;
end $$;
