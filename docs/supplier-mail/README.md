# Sigma / MFE email archive

Scope: incoming Gmail messages in `klgresidenceenquiry@gmail.com`, received on or after 2023-01-01 00:00 MYT, from the verified Sigma domain `sigmamy.com` or MFE `mfetsb@gmail.com`. Attachments are PDF-only. Original mailbox messages are never altered.

## Installation

The ChatGPT Gmail connection is separate from a persistent KLGCR application connection. An administrator must sign in to KLGCR at `/documents/suppliers`, expand Gmail connection setup, create a key, and install the supplied Apps Script under the company Gmail account. The page contains script and manifest links and Script Property names. Run `install` once and authorize Google. The script uses the Gmail API read-only scope; its other scopes permit HTTPS uploads and its own time trigger. It checks new mail every 15 minutes and backfills historical pages within execution limits. No public web-app deployment is required.

Keys are generated only by an authenticated KLGCR admin; only SHA-256 hashes are stored server-side. The key belongs in the private Apps Script properties, never source control. Admins can revoke each connection independently. PDFs upload directly to private Supabase Storage through signed upload URLs; the archive finalizer verifies PDF signature, size and SHA-256 before creating a document entry. Same-company identical content is deduplicated, with source email associations retained. Oversized (>50 MB) or invalid PDF attachments are flagged in their email detail page.

## Data and access

Additive migration `20261027051233_supplier_mail_archive.sql`. No updates/deletes to existing business tables or `system_documents`. New tables and `supplier-mail` bucket are restricted to active admin/management accounts via the existing `is_management()` guard. The connection credential table intentionally has RLS with no client policies and no anon/authenticated grants: service-role routes only. Signed file links expire in 5 minutes. Email bodies are rendered as escaped plain text; formatted originals stay in Gmail. Read flags are per KLGCR user, independent of Gmail unread status.

File classification is a filename/subject heuristic; management can change the folder. Unknowns go to Other Documents. A servicing appointment/confirmation does not count as a service report unless report evidence exists. Classification does not extract invoice amounts, prove payment, or perform price comparison. Those features require a later extraction/review workflow. Only incoming supplier messages are included; outgoing approvals and attachments sent solely by internal staff are outside this first connector.

## Verification

`npm run typecheck`; targeted ESLint; `vitest run src/lib/supplier-mail src/app/api/supplier-mail/ingest/route.test.ts`; `next build`.

Database tests exercise management/staff isolation, private PDFs, per-user read status, and server-only credential storage. API tests cover missing/revoked tokens, mailbox/sender/date scope, retry-safe email insertion, content deduplication and corrupt PDF rejection. Apps Script tests cover Gmail scopes, bounded supplier/date searches, trigger setup and cursor retention on failure.

Still requires live acceptance after Google authorization: import actual historic emails and PDF content, verify folder/attachment counts, open the signed PDFs, and confirm a later supplier email is ingested. Mocked tests cannot establish that account consent, quotas and live upload behavior work.
