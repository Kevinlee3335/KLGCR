-- Record explicit declaration acceptance at registration, without changing existing records.
create or replace function public.register_membership(p_member jsonb,p_receipt text) returns uuid language plpgsql security invoker set search_path='' as $$
declare mid uuid := (p_member->>'id')::uuid; period date := date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
 if coalesce(p_member->>'declaration_accepted','false')<>'true'
 or p_member->>'declaration_version' is distinct from '2026-10-17-v1'
 or jsonb_typeof(p_member->'declaration_clauses') is distinct from 'array'
 then raise exception 'Membership declaration acceptance required'; end if;
 if jsonb_array_length(p_member->'declaration_clauses')<>4 then raise exception 'Four declaration clauses required'; end if;
 insert into public.memberships(id,full_name,email,member_type,id_type,identification,gender,nationality,room_no,student_id,address,token_hash,token_ciphertext)
 values(mid,p_member->>'full_name',lower(p_member->>'email'),p_member->>'member_type',p_member->>'id_type',p_member->>'identification',p_member->>'gender',p_member->>'nationality',p_member->>'room_no',p_member->>'student_id',p_member->>'address',p_member->>'token_hash',p_member->>'token_ciphertext');
 insert into public.membership_payments(member_id,kind,period_start,amount,receipt_path)
 values(mid,'registration',period,case when p_member->>'member_type'='outsider' then 50 else 40 end,p_receipt);
 insert into public.membership_activity(member_id,event) values(mid,'registration_submitted');
 insert into public.membership_emails(member_id,event_key,kind,period_start)
 values(mid,'registered:'||mid,'registered',period);
 insert into public.membership_activity(member_id,event,details)
 values(mid,'rules_accepted',jsonb_build_object('version',p_member->>'declaration_version','clauses',p_member->'declaration_clauses'));
 return mid;
end $$;
revoke all on function public.register_membership(jsonb,text) from public,anon,authenticated;
grant execute on function public.register_membership(jsonb,text) to service_role;
