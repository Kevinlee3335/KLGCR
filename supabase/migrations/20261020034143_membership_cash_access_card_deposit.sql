-- RM10 is a cash access-card deposit, not part of the online payment.
do $migration$
declare signature text; original text; updated text;
begin
 foreach signature in array array['public.register_membership(jsonb,text)','public.review_membership_payment(uuid,uuid,boolean,text)','public.submit_membership_receipt(text,text,date)'] loop
  original:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(original,'case when p_member->>''member_type''=''outsider'' then 50 else 40 end','40');
  updated:=replace(updated,'case when member.member_type=''outsider'' and member.expires_on is null then 50 else 40 end','40');
  if original=updated then raise exception 'Fee expression changed in %; review migration',signature; end if;
  execute updated;
 end loop;
end $migration$;