-- Faiz can read utility photos through the scoped server upload endpoint.
-- AI Assistant and raw-photo OCR routes retain their Admin/Management checks.
-- Keep the existing shared budget, per-user rate limits and usage ledger.
create or replace function public.klgcr_ai_reserve(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_spent numeric; v_id uuid;
begin
  if not exists(select 1 from public.profiles where id=p_user_id and is_active and deleted_at is null and (role::text in ('admin','management_viewer') or (role::text='maintenance_staff' and id='595974ab-c1c2-4c85-8742-2baef04b459b'::uuid))) then raise exception 'Access denied'; end if;
  select reserved_myr into v_spent from klgcr_ai.budget where id=1 for update;
  if v_spent is null then raise exception 'Accounting unavailable'; end if;
  if v_spent+0.50>20 then raise exception 'RM20 budget reached'; end if;
  if exists(select 1 from klgcr_ai.requests where user_id=p_user_id and created_at>now()-interval '10 seconds') then raise exception 'Please wait 10 seconds'; end if;
  if (select count(*) from klgcr_ai.requests where user_id=p_user_id and created_at>now()-interval '24 hours')>=30 then raise exception 'Daily limit reached'; end if;
  update klgcr_ai.budget set reserved_myr=reserved_myr+0.50 where id=1;
  insert into klgcr_ai.requests(user_id) values(p_user_id) returning id into v_id;
  return jsonb_build_object('id',v_id,'reservedMyr',v_spent+0.50,'budgetMyr',20);
end $$;
revoke all on function public.klgcr_ai_reserve(uuid) from public,anon,authenticated;
grant execute on function public.klgcr_ai_reserve(uuid) to service_role;
