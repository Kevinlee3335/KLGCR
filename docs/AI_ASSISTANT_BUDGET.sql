-- Isolated AI accounting only. No existing tables, rows, policies or functions are changed.
create schema if not exists klgcr_ai;
revoke all on schema klgcr_ai from public, anon, authenticated;
create table if not exists klgcr_ai.budget (
  id integer primary key check(id=1), reserved_myr numeric not null default 0 check(reserved_myr between 0 and 20)
);
insert into klgcr_ai.budget(id) values(1) on conflict do nothing;
create table if not exists klgcr_ai.requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  created_at timestamptz not null default now(), reserved_myr numeric not null default 0.50,
  prompt_tokens integer, output_tokens integer, total_tokens integer, state text not null default 'reserved'
);
alter table klgcr_ai.budget enable row level security;
alter table klgcr_ai.requests enable row level security;
-- Privileged accounting RPCs deliberately exposed ONLY to service_role, never browser roles.
create or replace function public.klgcr_ai_reserve(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_spent numeric; v_id uuid;
begin
  if not exists(select 1 from public.profiles where id=p_user_id and is_active and deleted_at is null and role::text in ('admin','management_viewer')) then raise exception 'Access denied'; end if;
  select reserved_myr into v_spent from klgcr_ai.budget where id=1 for update;
  if v_spent is null then raise exception 'Accounting unavailable'; end if;
  if v_spent+0.50>20 then raise exception 'RM20 budget reached'; end if;
  if exists(select 1 from klgcr_ai.requests where user_id=p_user_id and created_at>now()-interval '10 seconds') then raise exception 'Please wait 10 seconds'; end if;
  if (select count(*) from klgcr_ai.requests where user_id=p_user_id and created_at>now()-interval '24 hours')>=30 then raise exception 'Daily limit reached'; end if;
  update klgcr_ai.budget set reserved_myr=reserved_myr+0.50 where id=1;
  insert into klgcr_ai.requests(user_id) values(p_user_id) returning id into v_id;
  return jsonb_build_object('id',v_id,'reservedMyr',v_spent+0.50,'budgetMyr',20);
end $$;
create or replace function public.klgcr_ai_finish(p_id uuid,p_prompt integer,p_output integer,p_total integer,p_state text)
returns void language sql security definer set search_path='' as $$
  update klgcr_ai.requests set prompt_tokens=p_prompt,output_tokens=p_output,total_tokens=p_total,state=p_state where id=p_id and state='reserved';
$$;
create or replace function public.klgcr_ai_usage()
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('reservedMyr',reserved_myr,'budgetMyr',20,'requests',(select count(*) from klgcr_ai.requests),'tokens',(select coalesce(sum(total_tokens),0) from klgcr_ai.requests)) from klgcr_ai.budget where id=1;
$$;
revoke all on function public.klgcr_ai_reserve(uuid),public.klgcr_ai_finish(uuid,integer,integer,integer,text),public.klgcr_ai_usage() from public,anon,authenticated;
grant execute on function public.klgcr_ai_reserve(uuid),public.klgcr_ai_finish(uuid,integer,integer,integer,text),public.klgcr_ai_usage() to service_role;
