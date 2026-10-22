alter table public.membership_payment_ledger drop constraint membership_payment_ledger_receipt_no_check;
alter table public.membership_payment_ledger add constraint membership_payment_ledger_receipt_no_length check(length(receipt_no)<=100);
alter table public.membership_payment_ledger add column receipt_updated_at timestamptz;
alter table public.membership_payment_ledger add column receipt_updated_by uuid references public.profiles(id);
create table public.membership_payment_receipt_history (
 id uuid primary key default gen_random_uuid(),ledger_id uuid not null references public.membership_payment_ledger(id),
 old_value text not null,new_value text not null,actor_id uuid references public.profiles(id),
 reason text not null default 'manual',created_at timestamptz not null default now()
);
alter table public.membership_payment_receipt_history enable row level security;
revoke all on public.membership_payment_receipt_history from public,anon,authenticated;
grant select,insert on public.membership_payment_receipt_history to service_role;
grant update(receipt_no,receipt_updated_at,receipt_updated_by) on public.membership_payment_ledger to service_role;
-- Restore original Excel receipt numbers without overwriting any later manual value.
insert into public.membership_payment_receipt_history(ledger_id,old_value,new_value,reason)
select id,receipt_no,btrim(source_receipt_no),'restored_from_excel' from public.membership_payment_ledger
where source='legacy' and receipt_no='' and nullif(btrim(source_receipt_no),'') is not null;
update public.membership_payment_ledger set receipt_no=btrim(source_receipt_no),receipt_updated_at=now()
where source='legacy' and receipt_no='' and nullif(btrim(source_receipt_no),'') is not null;
create function public.set_membership_payment_receipt(p_ledger uuid,p_actor uuid,p_receipt text,p_expected text)
returns void language plpgsql security invoker set search_path='' as $$
declare previous text;value text:=btrim(coalesce(p_receipt,''));
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then raise exception 'Admin permission required'; end if;
 if length(value)>100 or value~'[[:cntrl:]]' then raise exception 'Invalid receipt number'; end if;
 select receipt_no into previous from public.membership_payment_ledger where id=p_ledger for update;
 if not found then raise exception 'Payment record not found'; end if;
 if previous is distinct from p_expected then raise exception 'Receipt number changed. Refresh before saving'; end if;
 if previous=value then return; end if;
 update public.membership_payment_ledger set receipt_no=value,receipt_updated_at=now(),receipt_updated_by=p_actor where id=p_ledger;
 insert into public.membership_payment_receipt_history(ledger_id,old_value,new_value,actor_id) values(p_ledger,previous,value,p_actor);
end $$;
revoke all on function public.set_membership_payment_receipt(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.set_membership_payment_receipt(uuid,uuid,text,text) to service_role;
