alter table public.memberships add column photo_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('membership-photos','membership-photos',false,1048576,array['image/jpeg','image/png']);
-- Keep existing declaration, fee, payment and audit logic intact.
do $migration$
declare original text; updated text;
begin
 original:=pg_get_functiondef('public.register_membership(jsonb,text)'::regprocedure);
 updated:=replace(original,'address,token_hash,token_ciphertext)','address,token_hash,token_ciphertext,photo_path)');
 updated:=replace(updated,'p_member->>''token_ciphertext'');','p_member->>''token_ciphertext'',p_member->>''photo_path'');');
 if updated=original or position('token_ciphertext,photo_path)' in updated)=0 or position('p_member->>''photo_path''' in updated)=0 then
  raise exception 'Registration function changed; review photo migration before continuing';
 end if;
 execute updated;
end $migration$;