-- REVIEW AND RUN MANUALLY in Production after identifying Abdullah and Faiz by username.
-- This is intentionally not a migration: it does not silently alter Production data.
begin;

insert into public.profile_blocks (profile_id, block_id)
select p.id, b.id
from public.profiles p
cross join public.blocks b
where lower(p.full_name) in ('abdullah', 'faiz')
  and p.role = 'maintenance_staff'
  and p.is_active
  and p.deleted_at is null
  and b.code in ('A', 'B', 'C', 'D')
on conflict (profile_id, block_id) do nothing;

-- This must return exactly eight rows (four per staff member) before COMMIT.
select p.full_name, b.code
from public.profile_blocks pb
join public.profiles p on p.id = pb.profile_id
join public.blocks b on b.id = pb.block_id
where lower(p.full_name) in ('abdullah', 'faiz')
order by p.full_name, b.code;

commit;
