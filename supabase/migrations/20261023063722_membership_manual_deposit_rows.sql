alter table public.membership_payment_ledger add column created_by uuid references public.profiles(id);
alter table public.membership_payment_ledger drop constraint membership_payment_ledger_source_check;
alter table public.membership_payment_ledger add constraint membership_payment_ledger_source_check check(source in ('system','legacy','manual'));
alter table public.membership_payment_ledger drop constraint membership_payment_ledger_check;
alter table public.membership_payment_ledger add constraint membership_payment_ledger_check check(
 (source='system' and payment_id is not null and legacy_key is null) or
 (source='legacy' and payment_id is null and legacy_key is not null and import_id is not null) or
 (source='manual' and payment_id is null and legacy_key is null and import_id is null and kind is not null and kind='access_card_deposit' and amount is not null and amount=10 and created_by is not null)
);
create function public.add_membership_deposit_entry(p_id uuid,p_actor uuid,p_date date,p_name text,p_receipt text,p_reference text default '') returns uuid
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then raise exception 'Admin permission required'; end if;
 if p_id is null or p_date is null or p_date<'2000-01-01' or p_date>'2100-12-31' or p_name is null or length(btrim(p_name)) not between 1 and 200 or p_receipt is null or length(btrim(p_receipt)) not between 1 and 100 or p_reference is null or length(p_reference)>100 or p_name ~ '[[:cntrl:]]' or p_receipt ~ '[[:cntrl:]]' or p_reference ~ '[[:cntrl:]]' then raise exception 'Invalid deposit details'; end if;
 insert into public.membership_payment_ledger(id,source,collected_on,full_name,member_type,member_reference,receipt_no,amount,kind,created_by)
 values(p_id,'manual',p_date,btrim(p_name),'resident',btrim(p_reference),btrim(p_receipt),10,'access_card_deposit',p_actor)
 on conflict(id) do nothing;
 if not exists(select 1 from public.membership_payment_ledger where id=p_id and source='manual' and created_by=p_actor and collected_on=p_date and full_name=btrim(p_name) and receipt_no=btrim(p_receipt) and member_reference=btrim(p_reference)) then raise exception 'Entry changed. Refresh and try again.'; end if;
 return p_id;
end $$;
revoke all on function public.add_membership_deposit_entry(uuid,uuid,date,text,text,text) from public,anon,authenticated;
grant execute on function public.add_membership_deposit_entry(uuid,uuid,date,text,text,text) to service_role;
