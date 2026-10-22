create or replace function public.generate_due_membership_committee_reports() returns integer
language plpgsql security invoker set search_path='' as $$
declare day date:=(now() at time zone 'Asia/Kuala_Lumpur')::date; last_month date; first_month date; period date; generated integer:=0;
begin
 last_month:=(date_trunc('month',day)-case when extract(day from day)>=7 then interval '1 month' else interval '2 months' end)::date;
 -- Start with the membership system's launch month, including zero-collection months.
 first_month:=date '2026-10-01';
 for period in select d::date from generate_series(first_month,last_month,interval '1 month') d loop
  if not exists(select 1 from public.membership_committee_reports where month=period) then
   perform public.save_membership_committee_report(period,null); generated:=generated+1;
  end if;
 end loop;
 return generated;
end $$;
