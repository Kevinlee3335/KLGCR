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

## Testing form changes

Room/address is entered once: residents provide their room number, and outsiders provide their residential address / unit number in the same field. The server copies this into the existing address storage field for compatibility. Receipt upload is optional only in Vercel preview or local development. Production submissions still require a valid receipt. Missing test receipts are stored as null, stay pending verification and are labelled in Admin. This does not enable registration while database setup is incomplete.

## Live testing update — 17 October 2026

The three membership migrations have now been applied to the correct KLG CAMPUS RESIDENCE project (`zmypsakuyqpctbusrkps`). They create membership-specific tables only. Earlier notes about the connector showing a different project describe the original setup blocker and no longer apply.

Preview deployments enable real membership submissions by default unless `KLGCR_MEMBERSHIP_ENABLED=false` is explicitly set. Production remains disabled without explicit activation. Registration now atomically saves the application, payment-verification record and registration email queue entry, then attempts immediate delivery through the existing transactional email gateway. Mail status is visible on the private membership page. Mail delivery is not equivalent to payment approval: initial access stays pending until Admin approval.

A membership-only encryption key is generated in `membership_runtime`; this table has RLS and no public/authenticated grants. The server's service role can read it. This avoids copying authentication credentials or requiring a new Vercel secret just to test the feature. A configured `KLGCR_MEMBERSHIP_TOKEN_SECRET` continues to take precedence; do not add, remove or rotate an override after member links exist without migrating encrypted tokens.

Renewal and cancellation entry forms accept name and room number instead of requiring a copied management link. Renewal accepts a receipt (optional during preview testing). Requests disclose no matching member data or management token and cannot change membership until Admin review. Ambiguous/unmatched names remain in the review queue; they cannot be approved until details are resolved. Existing private email links still work as a convenience.

The exact original membership Rules A–D remain unavailable in the supplied material. Do not invent wording or replace these with fee reminders. Obtain the original four clauses before enabling an agreement checkbox for them.

## Payment QR source

The DuitNow payment code was decoded from the user's supplied bank stand photo on 17 October 2026. Merchant name is `K HOTEL SDN BHD`, currency code `458` (MYR), country `MY`, and no fixed amount is embedded. The original EMV CRC was verified. The regenerated SVG/PNG preserve the complete original 169-character payload; the PNG was decoded again and compared byte-for-byte with the original. No recipient or payment data was changed. Registration and renewal forms display the proper fee beside the QR and offer a PNG download before receipt upload.

## Original declaration recovered

The original `WhatsApp Image 2026-10-16 at 2.17.15 PM.jpeg` was located and visually read on 17 October 2026. Its four clauses (a–d) are transcribed in `src/lib/membership-declaration.ts` and displayed in full on New Registration. This supersedes the earlier note that the original wording was unavailable. New applicants must explicitly agree; registration records the clause text, version and server timestamp in an atomic `rules_accepted` activity entry. Existing member records are not retroactively marked as having agreed.
