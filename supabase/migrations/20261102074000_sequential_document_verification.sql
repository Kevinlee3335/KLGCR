create table public.document_verifications (
 document_type text not null check(document_type in ('billing','gym')),
 document_id uuid not null,
 entries jsonb not null default '[]'::jsonb check(jsonb_typeof(entries)='array' and jsonb_array_length(entries)<=2),
 primary key(document_type,document_id)
);
alter table public.document_verifications enable row level security;
revoke all on public.document_verifications from public,anon,authenticated;
grant select on public.document_verifications to authenticated;
grant all on public.document_verifications to service_role;
create policy "admin reads document verifications" on public.document_verifications for select to authenticated using ((select public.current_role())::text='admin');

create function public.verify_document(p_type text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare audit jsonb; reviewer text; actor uuid:=auth.uid(); stamp jsonb; actor_name text;
begin
 if p_type not in ('billing','gym') then raise exception 'Invalid document'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_type||p_id::text,0));
 if not exists(select 1 from public.profiles where id=actor and is_active and role::text='admin') then raise exception 'Admin account required'; end if;
 if p_type='billing' then
   if not exists(select 1 from public.billing_preview_runs where id=p_id) or exists(select 1 from public.billing_run_approvals where run_id=p_id) then raise exception 'Document unavailable or already approved'; end if;
 else
   if not exists(select 1 from public.gym_monthly_approvals where id=p_id and approved_at is null) then raise exception 'Document unavailable or already approved'; end if;
 end if;
 select entries into audit from public.document_verifications where document_type=p_type and document_id=p_id;
 audit:=coalesce(audit,'[]'::jsonb);
 if exists(select 1 from jsonb_array_elements(audit) e where e->>'user_id'=actor::text) then return audit; end if;
 reviewer:=case jsonb_array_length(audit) when 0 then 'fikri' when 1 then 'kevinlee3335' else null end;
 if reviewer is null or not exists(select 1 from public.profiles where id=actor and username=reviewer) then raise exception 'Verification must follow Fikri, then Kevin'; end if;
 select s.signature,p.full_name into stamp,actor_name from public.user_e_signatures s join public.profiles p on p.id=s.user_id where s.user_id=actor;
 if stamp is null then raise exception 'Save your personal E-signature before verifying'; end if;
 audit:=audit||jsonb_build_array(jsonb_build_object('user_id',actor,'name',actor_name,'verified_at',now(),'signature',stamp));
 insert into public.document_verifications values(p_type,p_id,audit) on conflict(document_type,document_id) do update set entries=excluded.entries;
 return audit;
end $$;
revoke all on function public.verify_document(text,uuid) from public,anon;
grant execute on function public.verify_document(text,uuid) to authenticated;

alter table public.billing_run_approvals add column verifications jsonb;
alter table public.gym_monthly_approvals add column verifications jsonb;
create function public.require_document_verifications() returns trigger
language plpgsql security definer set search_path='' as $$
declare audit jsonb; dtype text; did uuid;
begin
 if tg_table_name='gym_monthly_approvals' then
   if new.approved_at is null or (tg_op='UPDATE' and old.approved_at is not null) then return new; end if;
   dtype:='gym';did:=new.id;
 else dtype:='billing';did:=new.run_id;
 end if;
 select entries into audit from public.document_verifications where document_type=dtype and document_id=did;
 if audit is null or jsonb_array_length(audit)<>2 then raise exception 'Fikri and Kevin must verify this document before James can approve'; end if;
 new.verifications:=audit;
 return new;
end $$;
revoke all on function public.require_document_verifications() from public,anon,authenticated;
create trigger billing_requires_verification before insert on public.billing_run_approvals for each row execute function public.require_document_verifications();
create trigger gym_requires_verification before insert or update of approved_at on public.gym_monthly_approvals for each row execute function public.require_document_verifications();
