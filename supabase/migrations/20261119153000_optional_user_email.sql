-- Contact email remains empty for username-only users. Auth retains a random,
-- non-deliverable identity so the existing password sign-in flow is preserved.
alter table public.profiles alter column email drop not null;
create or replace function public.login_email_for_username(login_username text)
returns text language sql stable security definer set search_path='' as $$
 select u.email from public.profiles p join auth.users u on u.id=p.id
 where p.username=lower(trim(login_username)) and p.is_active and p.deleted_at is null limit 1
$$;
revoke all on function public.login_email_for_username(text) from public;
grant execute on function public.login_email_for_username(text) to anon,authenticated;
