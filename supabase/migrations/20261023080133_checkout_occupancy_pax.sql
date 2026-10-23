alter table public.checkout_rooms add column if not exists occupancy_pax smallint check (occupancy_pax between 1 and 20);
comment on column public.checkout_rooms.occupancy_pax is 'Room capacity confirmed by admin at final occupancy verification.';
