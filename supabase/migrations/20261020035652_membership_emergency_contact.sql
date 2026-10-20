alter table public.memberships add column emergency_contact text, add column emergency_relationship text;
do $migration$
declare original text; updated text;
begin
 original:=pg_get_functiondef('public.register_membership(jsonb,text)'::regprocedure);
 updated:=replace(original,'token_ciphertext,photo_path)','token_ciphertext,photo_path,emergency_contact,emergency_relationship)');
 updated:=replace(updated,'p_member->>''photo_path'');','p_member->>''photo_path'',p_member->>''emergency_contact'',p_member->>''emergency_relationship'');');
 if original=updated or position('photo_path,emergency_contact,emergency_relationship)' in updated)=0 then raise exception 'Review registration function before applying emergency contact migration'; end if;
 execute updated;
end $migration$;