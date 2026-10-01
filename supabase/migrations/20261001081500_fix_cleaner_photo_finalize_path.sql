-- Fix the cleaner photo finalisation path matcher.
-- The previous regex required a literal backslash before ".jpg", rejecting valid uploaded files.
create or replace function public.finalize_cleaner_complaint(p_complaint_id uuid, p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_complaint_no text;
begin
  if not public.cleaner_owns_complaint_path(p_complaint_id::text)
     or p_path !~ ('^complaints/' || p_complaint_id::text || '/[^/]+[.]jpg$') then
    raise exception 'Complaint verification failed.';
  end if;

  update public.complaints
  set photo_url = 'storage://checkout-evidence/' || p_path
  where id = p_complaint_id
  returning complaint_no into v_complaint_no;

  return v_complaint_no;
end;
$$;

revoke all on function public.finalize_cleaner_complaint(uuid, text) from public;
grant execute on function public.finalize_cleaner_complaint(uuid, text) to authenticated;
