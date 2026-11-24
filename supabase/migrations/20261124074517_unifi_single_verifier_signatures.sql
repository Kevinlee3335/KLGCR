-- Unifi alone needs one verifier (Fikri OR Kevin), followed by James.
-- Capture the saved personal signatures at the actual review, independently
-- of later changes to a user's signature settings.
alter table public.unifi_invoices
  add column review_signatures jsonb not null default '{}'::jsonb
    check (jsonb_typeof(review_signatures) = 'object'),
  drop constraint if exists unifi_invoices_fikri_signature_check,
  drop constraint if exists unifi_invoices_kevin_signature_check,
  drop constraint if exists unifi_invoices_check3,
  drop constraint if exists unifi_invoices_check4,
  drop constraint unifi_invoices_review_stage_check,
  alter column review_stage set default 'verification',
  add constraint unifi_invoices_review_stage_check check (
    review_stage in ('verification', 'fikri', 'kevin', 'james', 'approved', 'archived')
  ),
  add constraint unifi_invoices_requires_verifier check (
    review_stage not in ('james', 'approved') or fikri_verified_at is not null or kevin_verified_at is not null
  ),
  add constraint unifi_invoices_unsigned_queue check (
    review_stage <> 'verification' or (fikri_verified_at is null and kevin_verified_at is null)
  );

-- Restore signatures for reviews already performed only when the saved
-- signature predates that action. Never attribute a newer signature to it.
update public.unifi_invoices i set review_signatures = i.review_signatures || jsonb_build_object('fikri', s.signature)
from public.user_e_signatures s
where s.user_id = i.fikri_verified_by and i.fikri_verified_at is not null
  and s.updated_at <= i.fikri_verified_at;
update public.unifi_invoices i set review_signatures = i.review_signatures || jsonb_build_object('kevin', s.signature)
from public.user_e_signatures s
where s.user_id = i.kevin_verified_by and i.kevin_verified_at is not null
  and s.updated_at <= i.kevin_verified_at;
update public.unifi_invoices i set review_signatures = i.review_signatures || jsonb_build_object('james', s.signature)
from public.user_e_signatures s
where s.user_id = i.james_approved_by and i.james_approved_at is not null
  and s.updated_at <= i.james_approved_at;

-- The server reads the actor's signature using their authenticated session
-- and owner-only RLS, then passes that snapshot to this service-only RPC.
-- Service role does not gain access to the personal signature table.
create function public.advance_signed_unifi_invoice_review(p_invoice_id uuid, p_expected_stage text, p_actor_id uuid, p_signature jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  invoice public.unifi_invoices%rowtype;
  stamp jsonb;
  next_stage text;
  reviewed_at timestamptz := clock_timestamp();
begin
  if p_expected_stage is null or p_expected_stage not in ('fikri', 'kevin', 'james')
    or p_actor_id is null
    or public.compliance_review_recipient(p_expected_stage) is distinct from p_actor_id
    or not exists (select 1 from public.profiles where id = p_actor_id
      and role::text = 'admin' and is_active and deleted_at is null)
  then raise exception 'This invoice is awaiting its assigned reviewer'; end if;

  select * into invoice from public.unifi_invoices where id = p_invoice_id for update;
  if not found then raise exception 'The invoice is unavailable'; end if;
  -- Retried requests cannot replace a completed signature or requeue mail.
  if invoice.review_stage in ('james', 'approved') and (
    (p_expected_stage = 'fikri' and invoice.fikri_verified_by = p_actor_id)
    or (p_expected_stage = 'kevin' and invoice.kevin_verified_by = p_actor_id)
    or (p_expected_stage = 'james' and invoice.james_approved_by = p_actor_id)
  ) then return invoice.review_stage; end if;

  if p_expected_stage in ('fikri', 'kevin') and invoice.review_stage in ('verification', 'fikri', 'kevin') then
    next_stage := 'james';
  elsif p_expected_stage = 'james' and invoice.review_stage = 'james'
    and (invoice.fikri_verified_at is not null or invoice.kevin_verified_at is not null)
    and (invoice.review_signatures ? 'fikri' or invoice.review_signatures ? 'kevin') then
    next_stage := 'approved';
  else raise exception 'The invoice review stage has changed'; end if;

  stamp := p_signature;
  if stamp is null or jsonb_typeof(stamp) is distinct from 'object'
    or jsonb_typeof(stamp->'strokes') is distinct from 'array'
    or (jsonb_array_length(stamp->'strokes') = 0 and coalesce(stamp->>'imageDataUrl', '') = '')
  then raise exception 'Save your personal E-signature before reviewing'; end if;
  update public.unifi_invoices set
    review_stage = next_stage,
    review_signatures = review_signatures || jsonb_build_object(p_expected_stage, stamp),
    fikri_verified_at = case when p_expected_stage = 'fikri' then reviewed_at else fikri_verified_at end,
    fikri_verified_by = case when p_expected_stage = 'fikri' then p_actor_id else fikri_verified_by end,
    kevin_verified_at = case when p_expected_stage = 'kevin' then reviewed_at else kevin_verified_at end,
    kevin_verified_by = case when p_expected_stage = 'kevin' then p_actor_id else kevin_verified_by end,
    james_approved_at = case when p_expected_stage = 'james' then reviewed_at else james_approved_at end,
    james_approved_by = case when p_expected_stage = 'james' then p_actor_id else james_approved_by end
  where id = p_invoice_id;
  return next_stage;
end;
$$;
revoke all on function public.advance_unifi_invoice_review(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.advance_signed_unifi_invoice_review(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.advance_signed_unifi_invoice_review(uuid, text, uuid, jsonb) to service_role;

-- This queues James through the existing notification trigger without
-- recording another verification or approving/sending anything on his behalf.
update public.unifi_invoices set review_stage = 'james'
where review_stage in ('verification', 'fikri', 'kevin')
  and (fikri_verified_at is not null or kevin_verified_at is not null)
  and (review_signatures ? 'fikri' or review_signatures ? 'kevin');

with obsolete as (
  update public.document_review_push_outbox p
  set delivered_at = coalesce(p.delivered_at, now()), locked_until = null, claim_token = null, last_error = 'superseded'
  from public.unifi_invoices i
  where p.document_type = 'unifi_invoice' and p.document_id = i.id and p.stage in (0, 1)
    and i.review_stage in ('james', 'approved')
  returning p.id
)
update public.app_notifications n set read_at = coalesce(n.read_at, now())
from obsolete o where n.id = o.id;
