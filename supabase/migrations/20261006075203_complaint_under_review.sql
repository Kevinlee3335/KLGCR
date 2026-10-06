-- Record every Admin Under Review decision without changing the existing
-- complaint assignment workflow.
create table if not exists public.complaint_activity (
  id bigint generated always as identity primary key,
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  action text not null check (length(trim(action)) > 0),
  note text check (note is null or length(note) <= 1000),
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists complaint_activity_complaint_created_idx
  on public.complaint_activity(complaint_id, created_at);

alter table public.complaint_activity enable row level security;
grant select on public.complaint_activity to authenticated;

drop policy if exists "management reads complaint activity" on public.complaint_activity;
create policy "management reads complaint activity"
  on public.complaint_activity for select to authenticated
  using (public.is_management());

create or replace function public.mark_complaint_under_review(
  p_complaint_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.complaint_status;
  v_note text := nullif(trim(p_note), '');
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  if v_note is not null and length(v_note) > 1000 then
    raise exception 'Under Review note is too long';
  end if;

  select status into v_status
  from public.complaints
  where id = p_complaint_id
  for update;

  if not found then
    raise exception 'Complaint not found';
  end if;

  if v_status not in ('new'::public.complaint_status, 'under_review'::public.complaint_status) then
    raise exception 'Only an unassigned complaint can be put under review';
  end if;

  update public.complaints
  set status = 'under_review'::public.complaint_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_complaint_id;

  insert into public.complaint_activity(complaint_id, action, note, actor_id)
  values (
    p_complaint_id,
    case when v_status = 'under_review'::public.complaint_status
      then 'Under Review Note Added'
      else 'Status changed to Under Review'
    end,
    v_note,
    auth.uid()
  );
end;
$$;

revoke all on function public.mark_complaint_under_review(uuid, text) from public;
grant execute on function public.mark_complaint_under_review(uuid, text) to authenticated;
