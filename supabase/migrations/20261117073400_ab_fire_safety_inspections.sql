create table public.ab_fire_safety_inspections (like public.flex_inspections including all);

alter table public.ab_fire_safety_inspections
  add foreign key (updated_by) references public.profiles(id),
  add foreign key (inspected_by) references public.profiles(id),
  enable row level security;

revoke all on public.ab_fire_safety_inspections from public, anon, authenticated, service_role;
grant select, insert, update on public.ab_fire_safety_inspections to service_role;

create trigger enforce_ab_fire_safety_inspection_revision
before update on public.ab_fire_safety_inspections
for each row execute function public.enforce_flex_inspection_revision();
