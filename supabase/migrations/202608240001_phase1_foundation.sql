-- KLGCR V1 Phase 1: identity, role access, block assignment and settings foundation.
create extension if not exists pgcrypto;
create type public.app_role as enum ('admin','maintenance_staff','management_viewer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null,
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9._-]{3,30}$'),
  full_name text not null check (length(trim(full_name)) >= 2),
  role public.app_role not null default 'maintenance_staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index profiles_email_lower_key on public.profiles(lower(email));

create table public.blocks (
  id smallint generated always as identity primary key,
  code text not null unique check (code in ('A','B','C','D')),
  name text not null,
  is_active boolean not null default true
);
insert into public.blocks(code,name) values ('A','Block A'),('B','Block B'),('C','Block C'),('D','Block D');

create table public.profile_blocks (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  block_id smallint not null references public.blocks(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(profile_id,block_id)
);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings(key,value,description) values
 ('completion_requirements','{"require_action_taken":false,"require_after_photo":false,"require_remark":false}', 'V1 completion requirements'),
 ('inventory_movement_thresholds','{"fast":12,"normal":6,"slow":1,"no_movement_days":90}', 'Future inventory reporting thresholds');

create table public.user_access_audit (
 id bigint generated always as identity primary key,
 target_user_id uuid references public.profiles(id) on delete restrict,
 actor_user_id uuid references public.profiles(id) on delete restrict,
 action text not null,
 details jsonb not null default '{}',
 created_at timestamptz not null default now()
);

create function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end$$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

create function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,email,username,full_name)
 values(new.id,new.email,lower(coalesce(nullif(new.raw_user_meta_data->>'username',''),split_part(new.email,'@',1))),coalesce(nullif(new.raw_user_meta_data->>'full_name',''),'KLGCR User'));
 return new;
end$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create function public.current_role() returns public.app_role language sql stable security definer set search_path='' as $$select role from public.profiles where id=auth.uid() and is_active and deleted_at is null$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select coalesce(public.current_role()='admin',false)$$;
create function public.is_management() returns boolean language sql stable security definer set search_path='' as $$select coalesce(public.current_role() in ('admin','management_viewer'),false)$$;

-- Enables the requested username login without exposing a profiles SELECT to anonymous users.
create function public.login_email_for_username(login_username text) returns text language sql stable security definer set search_path='' as $$select email from public.profiles where username=lower(trim(login_username)) and is_active and deleted_at is null limit 1$$;
revoke all on function public.login_email_for_username(text) from public;
grant execute on function public.login_email_for_username(text) to anon,authenticated;

alter table public.profiles enable row level security;
alter table public.blocks enable row level security;
alter table public.profile_blocks enable row level security;
alter table public.app_settings enable row level security;
alter table public.user_access_audit enable row level security;

create policy "active user reads own profile; management reads all" on public.profiles for select to authenticated using ((id=auth.uid() and is_active and deleted_at is null) or public.is_management());
create policy "admins insert profiles" on public.profiles for insert to authenticated with check(public.is_admin());
create policy "admins update profiles" on public.profiles for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "active users read blocks" on public.blocks for select to authenticated using(public.current_role() is not null);
create policy "admins manage blocks" on public.blocks for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "user reads assignments; management reads all" on public.profile_blocks for select to authenticated using(profile_id=auth.uid() or public.is_management());
create policy "admins manage assignments" on public.profile_blocks for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "active users read settings" on public.app_settings for select to authenticated using(public.current_role() is not null);
create policy "admins manage settings" on public.app_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admins read access audit" on public.user_access_audit for select to authenticated using(public.is_admin());

-- Audit rows are written only by trusted server actions using the service role.
-- Authenticated sessions can read them when the RLS policy above permits, but can
-- never forge, edit, or delete audit history directly.
revoke insert,update,delete on public.user_access_audit from authenticated;
grant select on public.profiles,public.blocks,public.profile_blocks,public.app_settings,public.user_access_audit to authenticated;
grant insert,update on public.profiles to authenticated;
grant insert,update,delete on public.blocks,public.profile_blocks,public.app_settings to authenticated;
