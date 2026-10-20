-- Queue cancellation confirmations atomically with Admin approval.
alter table public.membership_emails drop constraint membership_emails_kind_check;
alter table public.membership_emails add constraint membership_emails_kind_check check (kind in ('registered','approved','reminder','cancelled'));
create function public.queue_membership_cancellation_email() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.status='pending' and new.status='approved' and new.request_type='cancel' and new.member_id is not null then
  insert into public.membership_emails(member_id,event_key,kind,period_start)
  values(new.member_id,'cancelled:'||new.id,'cancelled',date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date)
  on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.queue_membership_cancellation_email() from public,anon,authenticated;
grant execute on function public.queue_membership_cancellation_email() to service_role;
create trigger membership_cancellation_email after update of status on public.membership_requests
for each row execute function public.queue_membership_cancellation_email();