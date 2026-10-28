-- Reversible removal from operational lists; evidence and history stay intact.
alter table public.checkout_rooms add column if not exists deleted_at timestamptz;
alter table public.checkout_rooms add column if not exists deletion_reason text;
create index if not exists checkout_rooms_active_updated_idx on public.checkout_rooms(updated_at desc) where deleted_at is null;
create or replace function public.guard_checkout_deleted_room() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if auth.uid() is not null then
  if old.deleted_at is not null then
   raise exception 'This check-out record has been removed from active work.';
  end if;
  if new.deleted_at is distinct from old.deleted_at and not public.is_admin() then
   raise exception 'Only administrators can remove check-out records.';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.guard_checkout_deleted_room() from public,anon,authenticated;
create trigger guard_checkout_deleted_room before update on public.checkout_rooms for each row execute function public.guard_checkout_deleted_room();
