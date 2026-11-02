alter table public.official_receipts add column issuer_signature jsonb;
create function public.capture_receipt_signature() returns trigger language plpgsql security definer set search_path='' as $$
begin
  select signature into new.issuer_signature from public.user_e_signatures where user_id=new.created_by;
  return new;
end $$;
revoke all on function public.capture_receipt_signature() from public, anon, authenticated;
create trigger capture_receipt_signature before insert on public.official_receipts for each row execute function public.capture_receipt_signature();