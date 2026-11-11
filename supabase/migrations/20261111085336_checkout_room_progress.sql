create index if not exists checkout_defects_checkout_room_idx on public.checkout_defects(checkout_room_id);

-- Keep filtering and ordering ahead of pagination without returning defect descriptions.
create view public.checkout_room_progress with (security_invoker = true) as
with rooms as (
  select r.id, r.reference_no, r.room_no, r.status, r.assigned_to, r.cleaner_id, r.created_at,
    b.code as block_code, m.full_name as maintenance_name, c.full_name as cleaner_name,
    upper(regexp_replace(r.room_no, '[[:space:]-]+', '', 'g')) as room_number,
    r.utmspace_defects ~* '^\s*no defects?[.!]?\s*$' as no_defect,
    d.defect_count, d.remaining_count, d.painting_only,
    case
      when p.in_progress then 'in_progress'
      when p.assigned then 'assigned'
      when p.completed then 'completed'
    end as painting_status
  from public.checkout_rooms r
  join public.blocks b on b.id = r.block_id
  left join public.profiles m on m.id = r.assigned_to
  left join public.profiles c on c.id = r.cleaner_id
  cross join lateral (
    select count(*) as defect_count, count(*) filter (where status = 'open') as remaining_count,
      coalesce(bool_and(description ~* '\mpaint(ing)?\M|\mmou?ld(y)?\M|\m(wall|ceiling)\M.*(stain|dirty|peel|damp|water[[:space:]]*mark|seepage)|(stain|dirty|peel|damp|water[[:space:]]*mark|seepage).*\m(wall|ceiling)\M') filter (where status = 'open'), false) as painting_only
    from public.checkout_defects
    where checkout_room_id = r.id and description !~* '^\s*no defects?[.!]?\s*$'
  ) d
  cross join lateral (
    select bool_or(status = 'in_progress') as in_progress,
      bool_or(status = 'assigned') as assigned,
      bool_or(status = 'completed') as completed
    from public.checkout_paint_tasks
    where checkout_room_id = r.id
  ) p
  where r.deleted_at is null and (select public.is_management())
), eligible as (
  select rooms.*,
    case when starts_with(room_number, block_code) then room_number else block_code || room_number end as full_room,
    cleaner_id is null and (
      (status = 'verification' and remaining_count = 0) or
      (status = 'second_inspection' and defect_count = 0 and no_defect)
    ) as can_assign_cleaner,
    status = 'second_inspection' and assigned_to is null and defect_count > 0 as can_assign_maintenance
  from rooms
), classified as (
  select eligible.*,
    case
      when status = 'ready_for_occupancy' then 'ready_for_occupancy'
      when status = 'cleaning' then 'cleaning'
      when can_assign_cleaner and defect_count = 0 then 'no_defect_cleaner'
      when can_assign_cleaner then 'repair_complete_cleaner'
      when status = 'rectification' then 'rectification'
      when can_assign_maintenance and painting_only then 'painting_only'
      when status = 'second_inspection' and defect_count > 0 then 'awaiting_maintenance'
      else status::text
    end as progress_status
  from eligible
)
select id, reference_no, room_no, status, assigned_to, cleaner_id, created_at,
  block_code, maintenance_name, cleaner_name, defect_count, remaining_count, painting_status,
  progress_status, can_assign_cleaner, can_assign_maintenance,
  can_assign_maintenance and painting_only and coalesce(painting_status not in ('assigned', 'in_progress'), true) as can_assign_painting,
  regexp_replace(full_room, '[^A-Z0-9]', '', 'g') as search_room,
  regexp_replace(room_number, '[^A-Z0-9]', '', 'g') as search_room_number,
  regexp_replace(room_number, '[0-9]+$', '') as sort_room_prefix,
  substring(room_number from '[0-9]+$')::numeric as sort_room_number,
  array_position(array['painting_only', 'awaiting_maintenance', 'rectification', 'no_defect_cleaner',
    'repair_complete_cleaner', 'cleaning', 'verification', 'second_inspection', 'ready_for_occupancy'], progress_status) as status_rank
from classified;

revoke all on public.checkout_room_progress from public, anon, authenticated;
grant select on public.checkout_room_progress to authenticated;
