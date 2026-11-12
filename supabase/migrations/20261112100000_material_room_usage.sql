create table public.material_room_usage (
  request_item_id uuid not null references public.material_request_items(id) on delete cascade,
  room_no text not null check (room_no ~ '^[A-D][0-9]{3}$'),
  qty numeric(12,2) not null check (qty > 0),
  issued_at timestamptz,
  legacy_issue boolean not null default false,
  used_qty numeric(12,2) check (used_qty > 0 and used_qty <= qty),
  replaced_at timestamptz,
  confirmed_by uuid references public.profiles(id),
  primary key (request_item_id, room_no)
);

create index material_room_usage_history_idx on public.material_room_usage (room_no, issued_at desc)
  where issued_at is not null;
alter table public.material_room_usage enable row level security;
revoke all on public.material_room_usage from anon, authenticated;
grant select on public.material_room_usage to authenticated;
create policy "Read own or management room usage" on public.material_room_usage for select to authenticated
using (public.is_management() or exists (
  select 1 from public.material_request_items i join public.material_requests r on r.id=i.request_id
  where i.id=request_item_id and r.requested_by=(select auth.uid())
));

create function public.create_room_material_request(p_source_id uuid, p_checkout boolean, p_note text, p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  request_uuid uuid;
  line jsonb;
  item_uuid uuid;
  source_room text;
  allocations jsonb;
  total numeric;
begin
  if auth.uid() is null or public.current_role() is distinct from 'maintenance_staff' then
    raise exception 'Maintenance staff access required';
  end if;
  if p_checkout then
    request_uuid := public.create_checkout_material_request(p_source_id,p_note,p_items);
    select case when c.room_no ~ '^[0-9]{3}$' then b.code || c.room_no else upper(trim(c.room_no)) end
      into source_room from public.checkout_rooms c join public.blocks b on b.id=c.block_id where c.id=p_source_id;
  else
    request_uuid := public.create_material_request(p_source_id,p_note,p_items);
    select case when j.room_no ~ '^[0-9]{3}$' then b.code || j.room_no else upper(trim(j.room_no)) end
      into source_room from public.maintenance_jobs j left join public.blocks b on b.id=j.block_id where j.id=p_source_id;
  end if;

  for line in select value from jsonb_array_elements(p_items) loop
    select id into strict item_uuid from public.material_request_items
      where request_id=request_uuid and (
        inventory_item_id=nullif(line->>'inventory_item_id','')::uuid or
        (inventory_item_id is null and lower(other_item_name)=lower(trim(line->>'other_item_name')))
      );
    allocations := coalesce(line->'rooms','[]'::jsonb);
    if jsonb_typeof(allocations) <> 'array' or jsonb_array_length(allocations)>200 then
      raise exception 'Invalid room allocation';
    end if;
    if jsonb_array_length(allocations)=0 and source_room ~ '^[A-D][0-9]{3}$' then
      allocations := jsonb_build_array(jsonb_build_object('room_no',source_room,'qty',line->'qty'));
    end if;
    if jsonb_array_length(allocations)>0 then
      if exists (select 1 from jsonb_to_recordset(allocations) as a(room_no text, qty numeric)
        where room_no is null or room_no !~ '^[A-D][0-9]{3}$' or qty is null or qty<=0 or
          qty::text in ('NaN','Infinity','-Infinity') or qty<>round(qty,2)) then
        raise exception 'Enter a valid room and quantity for each allocation';
      end if;
      select sum(a.qty) into total from jsonb_to_recordset(allocations) as a(room_no text, qty numeric);
      if total<>(line->>'qty')::numeric then raise exception 'Room quantities must equal the material quantity'; end if;
      insert into public.material_room_usage(request_item_id,room_no,qty)
      select item_uuid,a.room_no,a.qty from jsonb_to_recordset(allocations) as a(room_no text, qty numeric);
    end if;
  end loop;
  return request_uuid;
end $$;

create function public.mark_material_rooms_issued()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.material_room_usage set issued_at=now()
  where request_item_id=new.id and issued_at is null;
  return new;
end $$;

create trigger mark_material_rooms_issued after update of issued_qty on public.material_request_items
for each row when (new.issued_qty >= new.requested_qty and coalesce(old.issued_qty,0)<new.requested_qty)
execute function public.mark_material_rooms_issued();

create function public.confirm_room_material_replacement(p_item_id uuid,p_room_no text,p_replaced_on date,p_used_qty numeric)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_replaced_on is null or not isfinite(p_replaced_on) or p_replaced_on>(now() at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Enter a valid replacement date';
  end if;
  if p_used_qty is null or p_used_qty <= 0 or p_used_qty::text in ('NaN','Infinity','-Infinity') or p_used_qty<>round(p_used_qty,2) then
    raise exception 'Enter a valid quantity used';
  end if;
  update public.material_room_usage
  set used_qty=p_used_qty,replaced_at=p_replaced_on::timestamp at time zone 'Asia/Kuala_Lumpur',confirmed_by=auth.uid()
  where request_item_id=p_item_id and room_no=p_room_no and issued_at is not null and replaced_at is null
    and not legacy_issue and p_used_qty<=qty
    and p_replaced_on >= (issued_at at time zone 'Asia/Kuala_Lumpur')::date;
  if not found then raise exception 'Select an issued item and a replacement date on or after issue'; end if;
end $$;

revoke all on function public.create_room_material_request(uuid,boolean,text,jsonb),
  public.confirm_room_material_replacement(uuid,text,date,numeric),public.mark_material_rooms_issued() from public,anon,authenticated;
grant execute on function public.create_room_material_request(uuid,boolean,text,jsonb),
  public.confirm_room_material_replacement(uuid,text,date,numeric) to authenticated;

-- Preserve the linked room on historical issues. Free-text notes do not establish actual replacement.
with historical as (
  select i.id, sum(h.qty) as qty, max(h.issued_at) as issued_at,
    case when coalesce(c.room_no,j.room_no) ~ '^[0-9]{3}$' then b.code || coalesce(c.room_no,j.room_no)
      else upper(trim(coalesce(c.room_no,j.room_no))) end as room_no
  from public.inventory_issue_history h
  join public.material_request_items i on i.request_id=h.request_id and i.inventory_item_id=h.inventory_item_id
  left join public.checkout_rooms c on c.id=h.checkout_room_id
  left join public.maintenance_jobs j on j.id=h.job_id
  left join public.blocks b on b.id=coalesce(c.block_id,j.block_id)
  group by i.id,b.code,c.room_no,j.room_no
)
insert into public.material_room_usage(request_item_id,room_no,qty,issued_at,legacy_issue)
select id,room_no,qty,issued_at,true from historical where room_no ~ '^[A-D][0-9]{3}$';
