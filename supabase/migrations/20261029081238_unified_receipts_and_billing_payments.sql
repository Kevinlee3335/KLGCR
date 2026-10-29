-- One shared annual receipt counter. Only server-side workflows can issue receipts.
create table public.official_receipt_counters(year integer primary key, last_number integer not null check(last_number>0));
create table public.official_receipts(
 id uuid primary key default gen_random_uuid(), source_key text unique not null,
 receipt_no text unique not null, kind text not null check(kind in ('rental','utility','gym')),
 paid_on date not null, payer text not null, email text not null default '',
 amount numeric(12,2) not null check(amount>0), description text not null,
 proof_path text, bank_reference text not null default '', created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), emailed_at timestamptz, email_error text
);
create table public.billing_payment_allocations(
 receipt_id uuid not null references public.official_receipts(id),run_id uuid not null references public.billing_preview_runs(id),
 line_index integer not null check(line_index>=0),amount numeric(12,2) not null check(amount>0),
 primary key(receipt_id,run_id,line_index)
);
create index billing_payment_invoice on public.billing_payment_allocations(run_id,line_index);
create table public.billing_payment_contacts(kind text not null check(kind in ('rental','utility')),account_key text not null,email text not null,primary key(kind,account_key));
alter table public.official_receipt_counters enable row level security;
alter table public.official_receipts enable row level security;
alter table public.billing_payment_allocations enable row level security;
alter table public.billing_payment_contacts enable row level security;
revoke all on public.official_receipt_counters,public.official_receipts,public.billing_payment_allocations,public.billing_payment_contacts from public,anon,authenticated;
grant all on public.official_receipt_counters,public.official_receipts,public.billing_payment_allocations,public.billing_payment_contacts to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('billing-payments','billing-payments',false,3145728,array['image/jpeg','image/png','application/pdf']) on conflict(id) do nothing;
create function public.issue_official_receipt(p_source text,p_kind text,p_paid_on date,p_payer text,p_email text,p_amount numeric,p_description text,p_proof text,p_reference text,p_actor uuid) returns public.official_receipts
language plpgsql security invoker set search_path='' as $$
declare result public.official_receipts; y integer:=extract(year from now() at time zone 'Asia/Kuala_Lumpur'); n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('receipt:'||p_source,0));
 select * into result from public.official_receipts where source_key=p_source;
 if found then return result; end if;
 insert into public.official_receipt_counters(year,last_number) values(y,1) on conflict(year) do update set last_number=public.official_receipt_counters.last_number+1 returning last_number into n;
 insert into public.official_receipts(source_key,receipt_no,kind,paid_on,payer,email,amount,description,proof_path,bank_reference,created_by)
 values(p_source,'KLGCR/'||right(y::text,2)||lpad(n::text,greatest(4,length(n::text)),'0'),p_kind,p_paid_on,p_payer,p_email,p_amount,p_description,p_proof,p_reference,p_actor) returning * into result;
 return result;
end $$;
revoke all on function public.issue_official_receipt(text,text,date,text,text,numeric,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.issue_official_receipt(text,text,date,text,text,numeric,text,text,text,uuid) to service_role;
create function public.record_billing_payment(p_id uuid,p_actor uuid,p_kind text,p_account text,p_date date,p_email text,p_proof text,p_reference text,p_allocations jsonb) returns public.official_receipts
language plpgsql security invoker set search_path='' as $$
declare a jsonb; r public.billing_preview_runs; line jsonb; idx integer; v numeric; used numeric; total numeric:=0; payer text; description text:=''; result public.official_receipts;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then raise exception 'Admin permission required'; end if;
 if p_kind not in ('rental','utility') or p_date is null or p_date>(now() at time zone 'Asia/Kuala_Lumpur')::date or p_email!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or p_proof not like 'payments/'||p_id::text||'/%' then raise exception 'Invalid payment'; end if;
 perform pg_advisory_xact_lock(hashtextextended('billing:'||p_kind||':'||p_account,0));
 select * into result from public.official_receipts where source_key='billing:'||p_id::text;
 if found then return result; end if;
 if jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations) not between 1 and 120 then raise exception 'Select payment months'; end if;
 if exists(select 1 from jsonb_array_elements(p_allocations) x group by x->>'run_id',x->>'line_index' having count(*)>1) then raise exception 'Duplicate invoice'; end if;
 for a in select * from jsonb_array_elements(p_allocations) loop
  idx:=(a->>'line_index')::integer;v:=(a->>'amount')::numeric;
  select * into r from public.billing_preview_runs where id=(a->>'run_id')::uuid and kind=p_kind;
  if not found or not exists(select 1 from public.billing_run_approvals where run_id=r.id) then raise exception 'Only approved invoices can receive payments'; end if;
  line:=r.snapshot->'lines'->idx;
  if idx<0 or line is null or line->>'accountId' is distinct from p_account or v is null or v<=0 or v<>round(v,2) then raise exception 'Invalid invoice allocation'; end if;
  select coalesce(sum(amount),0) into used from public.billing_payment_allocations where run_id=r.id and line_index=idx;
  if used+v>(line->>'amount')::numeric then raise exception 'Payment exceeds invoice balance. Refresh before confirming'; end if;
  payer:=line->>'name';total:=total+v;
  description:=description||case when description='' then '' else '; ' end||r.period||' - '||(line->>'billNo')||' RM '||v::text;
 end loop;
 result:=public.issue_official_receipt('billing:'||p_id::text,p_kind,p_date,payer,p_email,total,description,p_proof,p_reference,p_actor);
 insert into public.billing_payment_allocations(receipt_id,run_id,line_index,amount) select result.id,(x->>'run_id')::uuid,(x->>'line_index')::integer,(x->>'amount')::numeric from jsonb_array_elements(p_allocations) x;
 insert into public.billing_payment_contacts values(p_kind,p_account,p_email) on conflict(kind,account_key) do update set email=excluded.email;
 return result;
end $$;
revoke all on function public.record_billing_payment(uuid,uuid,text,text,date,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_billing_payment(uuid,uuid,text,text,date,text,text,text,jsonb) to service_role;
create function public.issue_gym_official_receipt() returns trigger language plpgsql security invoker set search_path='' as $$
declare m public.memberships; r public.official_receipts;
begin
 if new.status<>'approved' or new.kind not in ('registration','renewal') then return new; end if;
 if tg_op='UPDATE' and old.status='approved' then return new; end if;
 select * into m from public.memberships where id=new.member_id;
 r:=public.issue_official_receipt('gym:'||new.id::text,'gym',(new.reviewed_at at time zone 'Asia/Kuala_Lumpur')::date,m.full_name,m.email,new.amount,'Gym '||new.kind||' - '||to_char(new.period_start,'YYYY-MM'),new.receipt_path,'',new.reviewed_by);
 update public.membership_payment_ledger set receipt_no=r.receipt_no,receipt_updated_at=now() where payment_id=new.id;
 return new;
end $$;
revoke all on function public.issue_gym_official_receipt() from public,anon,authenticated;
grant execute on function public.issue_gym_official_receipt() to service_role;
create trigger zz_gym_official_receipt after insert or update of status on public.membership_payments for each row execute function public.issue_gym_official_receipt();
-- Issued receipt numbers cannot be edited through the legacy manual receipt editor.
create function public.protect_issued_receipt_number() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.receipt_no is distinct from old.receipt_no and exists(select 1 from public.official_receipts where source_key='gym:'||old.payment_id::text and receipt_no<>new.receipt_no) then raise exception 'An issued official receipt number cannot be changed'; end if;
 return new;
end $$;
revoke all on function public.protect_issued_receipt_number() from public,anon,authenticated;
grant execute on function public.protect_issued_receipt_number() to service_role;
create trigger protect_issued_receipt before update of receipt_no on public.membership_payment_ledger for each row execute function public.protect_issued_receipt_number();
