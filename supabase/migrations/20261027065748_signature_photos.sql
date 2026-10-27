-- Accept reviewed PNG signatures without changing existing drawings or signed documents.
create or replace function public.validate_e_signature() returns trigger language plpgsql security invoker set search_path='' as $$
declare stroke jsonb; point jsonb; total integer:=0;image text;bytes bytea;w bigint;h bigint;
begin
 if new.signature ? 'imageDataUrl' then
  image:=new.signature->>'imageDataUrl';
  if image is null or length(image)>180000 or image !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or new.signature->'strokes' is distinct from '[]'::jsonb then raise exception 'Invalid signature photo';end if;
  bytes:=decode(substring(image from 23),'base64');
  if octet_length(bytes)<33 or encode(substring(bytes from 1 for 8),'hex')<>'89504e470d0a1a0a' or encode(substring(bytes from 9 for 8),'hex')<>'0000000d49484452' then raise exception 'Upload a PNG signature';end if;
  w:=get_byte(bytes,16)::bigint*16777216+get_byte(bytes,17)::bigint*65536+get_byte(bytes,18)::bigint*256+get_byte(bytes,19);
  h:=get_byte(bytes,20)::bigint*16777216+get_byte(bytes,21)::bigint*65536+get_byte(bytes,22)::bigint*256+get_byte(bytes,23);
  if w not between 1 and 1200 or h not between 1 and 400 then raise exception 'Signature photo is too large';end if;
  new.updated_at:=now();return new;
 end if;
 if jsonb_typeof(new.signature->'strokes') is distinct from 'array' or jsonb_array_length(new.signature->'strokes') not between 1 and 80 then raise exception 'Draw a signature';end if;
 for stroke in select value from jsonb_array_elements(new.signature->'strokes') loop
  if jsonb_typeof(stroke) is distinct from 'array' or jsonb_array_length(stroke) not between 2 and 600 then raise exception 'Invalid signature stroke';end if;
  total:=total+jsonb_array_length(stroke);
  for point in select value from jsonb_array_elements(stroke) loop
   if jsonb_typeof(point) is distinct from 'array' or jsonb_array_length(point)<>2 or jsonb_typeof(point->0)<>'number' or jsonb_typeof(point->1)<>'number' then raise exception 'Invalid signature point';end if;
   if (point->>0)::numeric not between 0 and 1 or (point->>1)::numeric not between 0 and 1 then raise exception 'Invalid signature bounds';end if;
  end loop;
 end loop;
 if total>5000 then raise exception 'Signature too detailed';end if;
 new.updated_at:=now();return new;
end $$;
