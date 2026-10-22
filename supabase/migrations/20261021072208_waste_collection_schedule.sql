create table public.waste_security_links (
 id uuid primary key default gen_random_uuid(), guard_name text not null check(length(guard_name) between 1 and 100),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'), is_active boolean not null default true,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.waste_schedule_uploads (
 id uuid primary key default gen_random_uuid(), schedule_month date not null check(extract(day from schedule_month)=1),
 source_path text, source_name text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.waste_schedule_dates (
 id uuid primary key default gen_random_uuid(), collection_date date not null unique, deadline time,
 upload_id uuid not null references public.waste_schedule_uploads(id),
 review_status text not null default 'open' check(review_status in ('open','confirmed_missed','security_missing','cancelled')),
 review_note text, reviewed_by uuid references public.profiles(id), reviewed_at timestamptz
);
create table public.waste_collections (
 id uuid primary key, schedule_id uuid unique references public.waste_schedule_dates(id),
 security_link_id uuid not null references public.waste_security_links(id), guard_name text not null,
 collected_at timestamptz not null, bins integer not null check(bins between 1 and 999),
 photos text[] not null check(cardinality(photos) between 1 and 5), remarks text check(length(remarks)<=1000), created_at timestamptz not null default now()
);
create index waste_collections_date_idx on public.waste_collections(collected_at desc);
create index waste_upload_month_idx on public.waste_schedule_uploads(schedule_month);
create index waste_collections_link_idx on public.waste_collections(security_link_id);
create index waste_dates_upload_idx on public.waste_schedule_dates(upload_id);
create table public.waste_schedule_reviews (
 id uuid primary key default gen_random_uuid(), schedule_id uuid not null references public.waste_schedule_dates(id),
 review_status text not null, review_note text, reviewed_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create index waste_reviews_schedule_idx on public.waste_schedule_reviews(schedule_id);
alter table public.waste_security_links enable row level security;
alter table public.waste_schedule_uploads enable row level security;
alter table public.waste_schedule_dates enable row level security;
alter table public.waste_collections enable row level security;
alter table public.waste_schedule_reviews enable row level security;
revoke all on public.waste_security_links, public.waste_schedule_uploads, public.waste_schedule_dates, public.waste_collections, public.waste_schedule_reviews from anon, authenticated;
grant all on public.waste_security_links, public.waste_schedule_uploads, public.waste_schedule_dates, public.waste_collections, public.waste_schedule_reviews to service_role;
grant select on public.waste_schedule_uploads, public.waste_schedule_dates, public.waste_collections, public.waste_schedule_reviews to authenticated;
grant insert on public.waste_schedule_uploads, public.waste_schedule_dates to authenticated;
create policy waste_upload_read on public.waste_schedule_uploads for select to authenticated using(public.is_management());
create policy waste_dates_read on public.waste_schedule_dates for select to authenticated using(public.is_management());
create policy waste_collection_read on public.waste_collections for select to authenticated using(public.is_management());
create policy waste_review_read on public.waste_schedule_reviews for select to authenticated using(public.is_management());
create policy waste_upload_create on public.waste_schedule_uploads for insert to authenticated with check(public.is_admin() and created_by=auth.uid());
create policy waste_dates_create on public.waste_schedule_dates for insert to authenticated with check(public.is_admin());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('waste-collection','waste-collection',false,3000000,array['image/jpeg','image/png','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel']);
create function public.save_waste_schedule(p_month date,p_dates date[],p_deadline time,p_source text,p_name text)
returns void language plpgsql security invoker set search_path='' as $$
declare upload uuid;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if extract(day from p_month)<>1 or cardinality(p_dates) is null or cardinality(p_dates) not between 1 and 31 or exists(select 1 from unnest(p_dates) d where d is null or date_trunc('month',d)::date<>p_month) then raise exception 'Invalid schedule month or dates'; end if;
 insert into public.waste_schedule_uploads(schedule_month,source_path,source_name,created_by) values(p_month,p_source,p_name,auth.uid()) returning id into upload;
 insert into public.waste_schedule_dates(collection_date,deadline,upload_id) select distinct d,p_deadline,upload from unnest(p_dates) d on conflict(collection_date) do nothing;
end $$;
revoke all on function public.save_waste_schedule(date,date[],time,text,text) from public,anon;
grant execute on function public.save_waste_schedule(date,date[],time,text,text) to authenticated;
create function public.capture_waste_schedule_review() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.waste_schedule_reviews(schedule_id,review_status,review_note,reviewed_by) values(new.id,new.review_status,new.review_note,new.reviewed_by);
 return new;
end $$;
revoke all on function public.capture_waste_schedule_review() from public,anon,authenticated;
create trigger waste_review_audit after update of review_status,review_note on public.waste_schedule_dates for each row execute function public.capture_waste_schedule_review();
create function public.waste_collection_report_text(p_date date default (now() at time zone 'Asia/Kuala_Lumpur')::date,p_asof timestamptz default now())
returns text language plpgsql stable security invoker set search_path='' as $$
declare result text; extras text; missing_months text; first_day date := p_date-6;
begin
 select string_agg(format('%s%s | %s%s%s',s.collection_date,
   case when s.deadline is not null then ' by '||to_char(s.deadline,'HH24:MI') else '' end,
   case when c.id is not null then case when c.collected_at > ((s.collection_date + coalesce(s.deadline,time '23:59:59')) at time zone 'Asia/Kuala_Lumpur') then 'DELAYED' else 'COMPLETED' end || ' | Actual: '||to_char(c.collected_at at time zone 'Asia/Kuala_Lumpur','YYYY-MM-DD HH24:MI')||' | '||c.bins||' bins | Security: '||c.guard_name
   when p_asof > ((s.collection_date+coalesce(s.deadline,time '23:59:59')) at time zone 'Asia/Kuala_Lumpur') then 'NO RECORD - confirm with Security' else 'SCHEDULED - deadline not yet passed' end,
   case when s.review_status<>'open' then ' | Admin: '||replace(s.review_status,'_',' ') else '' end,
   case when coalesce(s.review_note,'')<>'' then ' | '||s.review_note else '' end),E'\n' order by s.collection_date)
 into result from public.waste_schedule_dates s left join public.waste_collections c on c.schedule_id=s.id and c.created_at<=p_asof and c.collected_at<=p_asof
 where s.review_status<>'cancelled' and s.collection_date<=p_date and (s.collection_date>=first_day or (c.id is null and s.review_status<>'security_missing') or (c.collected_at at time zone 'Asia/Kuala_Lumpur')::date>=first_day);
 select string_agg(format('%s | %s bins | Security: %s',to_char(c.collected_at at time zone 'Asia/Kuala_Lumpur','YYYY-MM-DD HH24:MI'),c.bins,c.guard_name),E'\n' order by c.collected_at) into extras
 from public.waste_collections c where c.schedule_id is null and c.created_at<=p_asof and c.collected_at<=p_asof and (c.collected_at at time zone 'Asia/Kuala_Lumpur')::date between first_day and p_date;
 select string_agg(to_char(m,'YYYY-MM'),', ') into missing_months from generate_series(date_trunc('month',first_day::timestamp),date_trunc('month',p_date::timestamp),interval '1 month') m
 where not exists(select 1 from public.waste_schedule_uploads u where u.schedule_month=m::date and u.created_at<=p_asof);
 return E'CLEANTECH | WEEKLY WASTE COLLECTION CHECK\n'||first_day||' to '||p_date||E' (MYT)\n'||
 case when missing_months is not null then 'SCHEDULE MISSING: '||missing_months||E' — compliance cannot be fully checked.\n' else '' end||
 E'\nSCHEDULED / OUTSTANDING COLLECTIONS\n'||coalesce(result,'None')||E'\n\nEXTRA / UNPLANNED COLLECTIONS\n'||coalesce(extras,'None')||E'\n\nNo record does not confirm a missed collection. Photos and submission details: Admin > Waste Collection.';
end $$;
revoke all on function public.waste_collection_report_text(date,timestamptz) from public,anon;
grant execute on function public.waste_collection_report_text(date,timestamptz) to authenticated,service_role;
create function public.append_waste_friday_report() returns trigger language plpgsql security invoker set search_path='' as $$
declare summary text;
begin
 if new.report_type='daily_summary' and extract(isodow from new.report_date)=5 then
   summary := public.waste_collection_report_text(new.report_date,now());
   new.whatsapp_text := coalesce(new.whatsapp_text,'')||E'\n\n'||summary;
   new.payload := coalesce(new.payload,'{}'::jsonb)||jsonb_build_object('waste_collection_weekly',summary);
 end if;
 return new;
end $$;
revoke all on function public.append_waste_friday_report() from public,anon,authenticated;
-- Friday snapshot trigger is installed by the release activation migration.
