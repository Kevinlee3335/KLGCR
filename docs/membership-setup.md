# Membership module

This feature is prepared on a review branch. Do not enable public registration until the migration and sender configuration have been verified on the correct KLGCR project.

## Entry points

- Admin: `/admin/members` (active admin role required)
- Public registration: `/membership/register`
- Registration QR PNG: `/api/membership/qr?download=1`
- Private renewal / cancellation: `/membership/manage/<256-bit-random-token>`
- Shareable membership status card: `/membership/card/<uuid>` (reference/status/expiry only)

RM40 per calendar month for every member. Only outsiders pay an additional RM10 on initial registration. Initial registration is for the current calendar month; no proration. Review this policy before activation. Expired memberships renew for the current month; current/future memberships renew for the first uncovered month. Past-month receipts cannot be approved silently; reject with instructions to resubmit for the current month.

Every registration field is currently required for both member types, as requested. Outsiders who are not students may need an agreed convention for student ID / room fields before launch.

## Activation

1. Verify the database belongs to KLGCR (`zmypsakuyqpctbusrkps`). The connector available during implementation returned a different inactive project; no live database was changed.
2. Apply `supabase/migrations/20261016070407_membership_registration.sql` through the established migration process. It adds isolated tables and a private storage bucket; it does not change existing records. Run database advisors against the intended project after applying.
3. Set `NEXT_PUBLIC_APP_URL` to the actual HTTPS origin and generate a strong, stable `KLGCR_MEMBERSHIP_TOKEN_SECRET` (at least 32 random characters). Store it as a server-side secret. Losing/rotating it requires a management-link recovery migration: tokens are encrypted at rest and cannot be reconstructed from their hash.
4. Verify `SUPABASE_SERVICE_ROLE_KEY` is configured server-side for that same project.
5. Reuse the existing Gmail gateway (`KLGCR_GMAIL_WEB_APP_URL` / `KLGCR_GMAIL_WEB_APP_SECRET`). Verify the deployed Apps Script is owned by, or authorized to send as, **klgcr.noreply@gmail.com**. Test an actual confirmation and inspect its sender. This code cannot prove sender ownership from an endpoint URL. The existing Resend fallback also requires a verified sender; an arbitrary gmail.com address cannot simply be set as a Resend sender.
6. Set plain text `KLGCR_MEMBERSHIP_PAYMENT_INSTRUCTIONS` with the actual bank / payment instructions. No bank details have been invented. The page directs applicants to Management if this is absent.
7. Verify `CRON_SECRET` and the daily cron in `vercel.json` (09:00 Malaysia time, compatible with the existing Hobby plan). The cron authenticates its request, calculates dates in Asia/Kuala_Lumpur, and begins reminder queuing during the daily run on the third-last day of each month. It catches up through month end. Unique monthly reminder keys prevent repeated queuing, and renewed/cancelled members are skipped at delivery time.
8. Deploy the review branch to a test URL, set `KLGCR_MEMBERSHIP_ENABLED=true` there, then test the full checklist below. Production stays disabled until enabled explicitly.

## Checks before production

- Scan the registration QR with a phone and verify its origin matches that environment.
- Register resident and outsider test members: expected RM40 and RM50.
- Verify invalid/oversize receipt rejection and private storage access.
- Verify Admin receipt viewing, actual bank verification checkbox, rejection reason, re-upload, approval and duplicate approval handling.
- Confirm the approved member email arrives from the specified Gmail account, contains working management / registration links and a scannable member QR.
- Renew once and verify the correct calendar month, then test multiple months and year rollover.
- Cancel and confirm audit history remains, pending payments are rejected, the public card shows cancelled, and the blocking export contains the member.
- Test third-last-day reminders with renewed/unrenewed/cancelled fixtures and verify failed email retries. The durable queue provides at-least-once delivery: interruption after delivery but before saving its status can cause a duplicate email.
- Review private management-link handling. The pages use `no-referrer` and no indexing; management links are bearer credentials. Existing infrastructure/proxy access logs must redact these paths. QR cards do not contain these tokens or PII.
- Verify tablet/phone layout and live access checks. Local verification covers types/build and database behavior, not live browser → production database → Gmail delivery.

## Operational boundaries

Receipts are checked for supported file signatures and size. There is no OCR or bank transaction integration in this version. Admin must verify receipt contents, amount and actual receipt of funds.

The access-card integration is not available. Expired/cancelled members are identified dynamically and can be exported as a CSV, with formula injection protection. A physical card identifier is not collected in the requested fields, so Management must match the member/room to the access system. No claim is made that this module automatically blocks the door reader.

Member details, receipt paths, encrypted management tokens, audit entries and email queue tables have RLS enabled with no anon/authenticated grants or policies. Only the server-side service role accesses them. Privileged mutation functions use security invoker and explicitly revoke public execute. Admin identity is verified through the existing active profile check before service calls; database review additionally checks the actor's admin profile. Cancellation requires the private token and an explicit form confirmation. Registration/renewal use a persistent hourly IP limit and unique identity/email/month constraints. Review shared-campus NAT throughput before a large registration campaign.

Email queue batches are bounded and paginated with up to 20 concurrent deliveries and a four-minute processing budget. Failed messages are attempted at most once per run; leftovers are retried in the next daily run or by Admin. Pending delivery failures remain visible to Admin and are retried daily. A worker interruption is reclaimed after 15 minutes. A large registration/reminder run should be load-tested against Gmail quotas and function duration before launch.
