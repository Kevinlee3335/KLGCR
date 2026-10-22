# Cleantech waste collection

Routes: `/admin/waste-collection` (Admin / management viewer), `/waste-collection` (Security scoped link).

Admin uploads the original monthly PDF/image/Excel and confirms scheduled dates. The original file is retained; arbitrary PDF/image dates are not automatically interpreted. Days can be entered as `2, 5, 9` or full ISO dates. Repeated saves add dates without deleting previous records. Cancel incorrect dates with a confirmation note. Deadlines default to the end of the scheduled day in Malaysia.

Create a named Security officer/team link, copy it, and send it to Security. The bearer link only grants collection submission; it cannot access other application data. The token is stored as a SHA-256 hash; the raw link is displayed only on creation. Disable lost links and create replacements. The server verifies the link for every upload. Guard name is the link's configured name; shared team links identify the team rather than an individual.

Security uploads 1–5 photos, collection date/time and bins. Photos are resized to JPEG on the phone, capped at 700 KB each, to stay within Vercel's request limit. The default schedule is today; delayed collections must select the original scheduled date. Unplanned collections are retained separately. Retry IDs prevent duplicate records; one collection can fulfil one schedule date. Photos and source schedules are private and viewed through one-hour signed URLs.

`waste_collection_report_text` checks the rolling seven days and older unresolved dates. Actual collection time determines on-time/delayed; submission time is recorded separately. Today's deadline must pass before a missing record is flagged. Missing schedule months are explicitly reported. Admin confirmations and notes are audit-logged. Evidence has no delete permission through the client.

## Release

- `20261021072208_waste_collection_schedule.sql`: additive schema, private bucket, RPCs, report functions. Safe for preview preparation; does not change existing report output.
- `20261021072442_activate_waste_friday_report.sql`: **apply when releasing to production**. Adds the Friday daily-summary snapshot trigger, covering both SQL scheduled reports and manual generation. Existing report text is preserved and the Cleantech weekly section is appended. No new email/WhatsApp recipient or messaging channel is created.
- Until the activation migration is applied, report preview is available but Friday summaries are unchanged.

Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and focused Vitest database tests. PGlite covers RLS access, atomic schedule save, deadline handling, review audit and Friday snapshot integration.
