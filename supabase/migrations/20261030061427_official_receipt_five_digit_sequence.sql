-- Shared receipt numbers: KLGCR/2600001, KLGCR/2700001, ...
-- Retain the existing counter and all issued receipts.
create or replace function public.issue_official_receipt(p_source text,p_kind text,p_paid_on date,p_payer text,p_email text,p_amount numeric,p_description text,p_proof text,p_reference text,p_actor uuid) returns public.official_receipts
language plpgsql security invoker set search_path='' as $$
declare result public.official_receipts; y integer:=extract(year from now() at time zone 'Asia/Kuala_Lumpur'); n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('receipt:'||p_source,0));
 select * into result from public.official_receipts where source_key=p_source;
 if found then return result; end if;
 insert into public.official_receipt_counters(year,last_number) values(y,1) on conflict(year) do update set last_number=public.official_receipt_counters.last_number+1 returning last_number into n;
 insert into public.official_receipts(source_key,receipt_no,kind,paid_on,payer,email,amount,description,proof_path,bank_reference,created_by)
 values(p_source,'KLGCR/'||right(y::text,2)||lpad(n::text,greatest(5,length(n::text)),'0'),p_kind,p_paid_on,p_payer,p_email,p_amount,p_description,p_proof,p_reference,p_actor) returning * into result;
 return result;
end $$;
revoke all on function public.issue_official_receipt(text,text,date,text,text,numeric,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.issue_official_receipt(text,text,date,text,text,numeric,text,text,text,uuid) to service_role;
