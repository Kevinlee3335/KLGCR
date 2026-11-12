# Supplier email archive

Scope covers incoming Gmail messages in `klgresidenceenquiry@gmail.com` received on or after 2023-01-01 00:00 MYT from approved suppliers. The Sigma domain and existing MFE address remain supported. New suppliers use verified exact sender addresses maintained privately in Supabase. Attachments are PDF-only. Original mailbox messages are never altered.

## Installation

The ChatGPT Gmail connection is separate from a persistent KLGCR application connection. An administrator must sign in to KLGCR at `/documents/suppliers`, expand Gmail connection setup, create a key, and install the supplied Apps Script under the company Gmail account. The page contains script and manifest links and Script Property names. Run `install` once and authorize Google. The script uses the Gmail API read-only scope; its other scopes permit HTTPS uploads and its own time trigger. It checks new mail every 15 minutes and backfills historical pages within execution limits. No public web-app deployment is required.

To expand an existing connection, apply `20261112074720_supplier_mail_sender_registry.sql`, then insert supplier names and normalized exact sender addresses into `supplier_mail_suppliers` and `supplier_mail_sender_rules` using the private database connection. Deploy KLGCR with the matching intake route. In the original Apps Script project, replace `Code.gs` with the current `public/supplier-mail/sync.gs`, keep its existing script properties, and run `install` under the company Gmail account. The script keeps the existing trigger, reads the new sender rules through the authenticated intake endpoint, and replays historical pages when the rules change. The Documents setup panel shows the last successful scan separately from the last imported email.

Keys are generated only by an authenticated KLGCR admin; only SHA-256 hashes are stored server-side. The key belongs in the private Apps Script properties, never source control. Admins can revoke each connection independently. PDFs upload directly to private Supabase Storage through signed upload URLs; the archive finalizer verifies PDF signature, size and SHA-256 before creating a document entry. Same-company identical content is deduplicated, with source email associations retained. Oversized (>50 MB) or invalid PDF attachments are flagged in their email detail page.

## Data and access

Additive migration `20261027051233_supplier_mail_archive.sql`. No updates/deletes to existing business tables or `system_documents`. New tables and `supplier-mail` bucket are restricted to active admin/management accounts via the existing `is_management()` guard. The connection credential table intentionally has RLS with no client policies and no anon/authenticated grants: service-role routes only. Signed file links expire in 5 minutes. Email bodies are rendered as escaped plain text; formatted originals stay in Gmail. Read flags are per KLGCR user, independent of Gmail unread status.

File classification uses the attachment filename and may also use the subject if there is only one PDF. Management can change the folder. Quotations, invoices, service reports and agreements have separate folders. Unclear PDFs go to Other Documents. A servicing appointment stays there unless the message identifies a service report. This intake only reads incoming mail and archives files.

## Verification

`npm run typecheck`; targeted ESLint; `vitest run src/lib/supplier-mail src/app/api/supplier-mail/ingest/route.test.ts`; `next build`.

Database tests exercise management/staff isolation, private PDFs, per-user read status, and server-only credential storage. API tests cover missing/revoked tokens, mailbox/sender/date scope, retry-safe email insertion, content deduplication and corrupt PDF rejection. Apps Script tests cover Gmail scopes, bounded supplier/date searches, trigger setup and cursor retention on failure.

Still requires live acceptance after Google authorization: import actual historic emails and PDF content, verify folder/attachment counts, open the signed PDFs, and confirm a later supplier email is ingested. Mocked tests cannot establish that account consent, quotas and live upload behavior work.
