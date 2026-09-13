-- Independent check-out room inspection, rectification, cleaning and readiness workflow.
alter type public.app_role add value if not exists 'cleaner';

create type public.checkout_status as enum ('second_inspection','rectification','cleaning','verification','ready_for_occupancy');
create type public.checkout_defect_status as enum ('open','rectified');
create type public.checkout_photo_kind as enum ('inspection','completion','cleaning');

create table public.checkout_rooms (
 id uuid primary key default gen_random_uuid(), reference_no text not null unique default ('COR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
 block_id smallint not null references public.blocks(id), room_no text not null,
 utmspace_defects text not null, inspection_notes text, status public.checkout_status not null default 'second_inspection',
 assigned_to uuid references public.profiles(id), cleaner_id uuid references public.profiles(id),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), ready_at timestamptz
);
create table public.checkout_defects (
 id uuid primary key default gen_random_uuid(), checkout_room_id uuid not null references public.checkout_rooms(id) on delete cascade,
 description text not null, source text not null check(source in ('utmspace','second_inspection')), status public.checkout_defect_status not null default 'open',
 created_by uuid not null references public.profiles(id), rectified_by uuid references public.profiles(id), rectified_at timestamptz, created_at timestamptz not null default now()
);
create table public.checkout_photos (
 id uuid primary key default gen_random_uuid(), checkout_room_id uuid not null references public.checkout_rooms(id) on delete cascade,
 defect_id uuid references public.checkout_defects(id) on delete cascade, kind public.checkout_photo_kind not null, storage_path text not null,
 uploaded_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.checkout_history (
 id bigint generated always as identity primary key, checkout_room_id uuid not null references public.checkout_rooms(id) on delete cascade,
 actor_id uuid not null references public.profiles(id), action text not null, notes text, from_status public.checkout_status, to_status public.checkout_status, created_at timestamptz not null default now()
);
create trigger checkout_rooms_updated_at before update on public.checkout_rooms for each row execute function public.set_updated_at();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('checkout-evidence','checkout-evidence',false,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
alter table public.checkout_rooms enable row level security; alter table public.checkout_defects enable row level security; alter table public.checkout_photos enable row level security; alter table public.checkout_history enable row level security;
create policy "checkout participants read rooms" on public.checkout_rooms for select to authenticated using (public.is_management() or assigned_to=auth.uid() or cleaner_id=auth.uid());
create policy "admins create checkout rooms" on public.checkout_rooms for insert to authenticated with check(public.is_admin() and created_by=auth.uid());
create policy "participants update checkout rooms" on public.checkout_rooms for update to authenticated using(public.is_admin() or assigned_to=auth.uid() or cleaner_id=auth.uid()) with check(public.is_admin() or assigned_to=auth.uid() or cleaner_id=auth.uid());
create policy "participants read checkout defects" on public.checkout_defects for select to authenticated using(exists(select 1 from public.checkout_rooms r where r.id=checkout_room_id and (public.is_management() or r.assigned_to=auth.uid() or r.cleaner_id=auth.uid())));
create policy "admins add checkout defects" on public.checkout_defects for insert to authenticated with check(public.is_admin() and created_by=auth.uid());
create policy "rectifier updates checkout defects" on public.checkout_defects for update to authenticated using(exists(select 1 from public.checkout_rooms r where r.id=checkout_room_id and (public.is_admin() or r.assigned_to=auth.uid()))) with check(exists(select 1 from public.checkout_rooms r where r.id=checkout_room_id and (public.is_admin() or r.assigned_to=auth.uid())));
create policy "participants read checkout photos" on public.checkout_photos for select to authenticated using(exists(select 1 from public.checkout_rooms r where r.id=checkout_room_id and (public.is_management() or r.assigned_to=auth.uid() or r.cleaner_id=auth.uid())));
create policy "participants add checkout photos" on public.checkout_photos for insert to authenticated with check(uploaded_by=auth.uid() and exists(select 1 from public.checkout_rooms r where r.id=checkout_room_id and (public.is_admin() or r.assigned_to=auth.uid() or r.cleaner_id=auth.uid())));
create policy "participants read checkout history" on public.checkout_history for select to authenticated using(exists(select 1 from public.checkout_rooms r where r.id=checkout_room_id and (public.is_management() or r.assigned_to=auth.uid() or r.cleaner_id=auth.uid())));
create policy "participants add checkout history" on public.checkout_history for insert to authenticated with check(actor_id=auth.uid() and exists(select 1 from public.checkout_rooms r where r.id=checkout_room_id and (public.is_admin() or r.assigned_to=auth.uid() or r.cleaner_id=auth.uid())));
create policy "checkout evidence read" on storage.objects for select to authenticated using(bucket_id='checkout-evidence' and exists(select 1 from public.checkout_rooms r where (storage.foldername(name))[1]=r.id::text and (public.is_management() or r.assigned_to=auth.uid() or r.cleaner_id=auth.uid())));
create policy "checkout evidence upload" on storage.objects for insert to authenticated with check(bucket_id='checkout-evidence' and exists(select 1 from public.checkout_rooms r where (storage.foldername(name))[1]=r.id::text and (public.is_admin() or r.assigned_to=auth.uid() or r.cleaner_id=auth.uid())));
grant select,insert,update on public.checkout_rooms,public.checkout_defects,public.checkout_photos,public.checkout_history to authenticated; grant usage,select on sequence public.checkout_history_id_seq to authenticated;
