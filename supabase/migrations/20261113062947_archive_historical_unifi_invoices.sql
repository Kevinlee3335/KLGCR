alter table public.unifi_invoices
  drop constraint unifi_invoices_review_stage_check,
  add constraint unifi_invoices_review_stage_check
    check (review_stage in ('fikri', 'kevin', 'james', 'approved', 'archived'));

-- The initial September–November backfill used this Roundcube source marker.
-- Preserve any verification already recorded and the normal default for new bills.
with archived_invoices as (
  update public.unifi_invoices
  set review_stage = 'archived'
  where source = 'webmail'
    and source_message_id ~ '^roundcube:inbox:[0-9]+$'
    and period between '2026-09' and '2026-11'
    and review_stage = 'fikri'
  returning id
),
review_events as materialized (
  select p.id, p.document_id, p.recipient_id, p.href
  from public.document_review_push_outbox p
  join archived_invoices i on i.id = p.document_id
  where p.document_type = 'unifi_invoice'
),
retired_pushes as (
  update public.document_review_push_outbox p
  set delivered_at = now(), locked_until = null, claim_token = null, last_error = 'superseded'
  from review_events e
  where p.id = e.id and p.delivered_at is null
)
delete from public.app_notifications n
using review_events e
where n.id = e.id and n.entity_id = e.document_id and n.recipient_id = e.recipient_id
  and n.href = e.href and n.type in ('document_verification', 'document_approval_requested');
