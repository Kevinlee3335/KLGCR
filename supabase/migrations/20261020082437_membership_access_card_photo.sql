alter table public.memberships add column if not exists access_card_path text;
do $patch$ declare definition text; begin
 select pg_get_functiondef(oid) into definition from pg_proc where pronamespace='public'::regnamespace and proname='register_membership';
 if position('access_card_path' in definition)=0 then
 definition:=replace(definition,'photo_path,emergency_contact,emergency_relationship)','photo_path,emergency_contact,emergency_relationship,access_card_path)');
 definition:=replace(definition,'p_member->>''emergency_relationship'');','p_member->>''emergency_relationship'',p_member->>''access_card_path'');');
 execute definition;
 end if;
end $patch$;