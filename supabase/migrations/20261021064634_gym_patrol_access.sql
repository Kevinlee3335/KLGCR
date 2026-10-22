-- Gym patrol data is served by authenticated, explicitly authorized server pages.
-- Do not grant this role direct access to member PII, receipts, or other modules.
alter type public.app_role add value if not exists 'gym_patrol';
do $$
declare target record; definition text; signature text;
begin
 for target in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
 loop
  if target.relname='profiles' then
   execute format('create policy gym_patrol_scope on public.%I as restrictive for all to authenticated using ((select public.current_role()::text) is distinct from ''gym_patrol'' or id=(select auth.uid())) with check ((select public.current_role()::text) is distinct from ''gym_patrol'')',target.relname);
  else
   execute format('create policy gym_patrol_scope on public.%I as restrictive for all to authenticated using ((select public.current_role()::text) is distinct from ''gym_patrol'') with check ((select public.current_role()::text) is distinct from ''gym_patrol'')',target.relname);
  end if;
 end loop;
 -- Older staff functions bypass RLS and rely on assignment alone.
 foreach signature in array array['public.update_assigned_daily_task(bigint,text,text)','public.materialize_recurring_tasks(date)'] loop
  if to_regprocedure(signature) is not null then
   select pg_get_functiondef(to_regprocedure(signature)) into definition;
   definition:=regexp_replace(definition,'\mbegin\M',E'begin\n if public.current_role()::text = ''gym_patrol'' then raise exception ''Gym patrol is read only''; end if;','i');
   execute definition;
  end if;
 end loop;
end $$;
create policy gym_patrol_scope on storage.objects as restrictive for all to authenticated
 using ((select public.current_role()::text) is distinct from 'gym_patrol')
 with check ((select public.current_role()::text) is distinct from 'gym_patrol');
