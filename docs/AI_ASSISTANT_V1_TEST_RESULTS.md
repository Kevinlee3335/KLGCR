# KLGCR AI Assistant V1.0 — preview validation

Branch: `feature/ai-assistant-v1`. Main baseline: `112feae0831f13a8d66b80e71a6200feade83fc8`.

## Implemented behavior

- Server-validated active Admin and Management roles; Cleaner and Maintenance denied.
- Exact Preview environment + branch gate for page, navigation, API.
- Gemini 2.5 Flash chat with up to eight context messages, input limits, timeout, safe error handling and retry-preserved question.
- Four authenticated read-only SELECT sources: complaints, maintenance_jobs, admin_daily_tasks, inventory_items. No operational RPCs or mutation queries.
- Source counts, loaded counts, snapshot time, deterministic status/staff workload/low-stock summaries. Up to 500 work rows and 1000 active inventory rows; 80 details/source prioritise room/item codes. AI is instructed to disclose coverage and avoid invented totals or staff rankings.
- Tenant names, contact fields, photos and free-text complaint descriptions are excluded from the connector. Staff names and daily task titles are included for authorised operational analysis.
- Desktop and mobile styles, keyboard focus, readable textarea, loading/error states, suggested questions and clear chat.

## Budget and security

An isolated `klgcr_ai` schema stores accounting only. Existing tables/data/RLS remain unchanged. Three accounting RPCs are executable only by service_role. Operational reads never use the service key. A transaction locks the shared budget before reserving RM0.50/request, never allowing more than RM20 lifetime; this conservatively pauses after at most 40 requests, potentially before actual provider spending reaches RM20. Reservations survive failures/redeploys; actual token counts are also recorded. Provider errors/timeouts retain their reservation. Per-user limits: 30 attempts/24 hours and 10-second minimum spacing.

Each Gemini payload is bounded to 80,000 UTF-8 bytes, output to 2,000 tokens with thinking disabled. Model rates checked against official Gemini pricing: USD0.30/M input and USD2.50/M output. RM0.50 is a conservative allocation, not an invoice or live exchange rate. No search/tools/cache billing is enabled. Google account-wide billing, other apps using the key, prepaid balance and auto-recharge cannot be verified from the available connectors; no claim is made that Google auto-recharge was disabled.

GEMINI_API_KEY metadata confirmed Preview-only; required Supabase service/public variables present in Preview. Secret values were not retrieved or printed.

## Verified

- 219 tests across 55 test files passed (includes existing regression suite).
- TypeScript, ESLint (zero errors; four pre-existing image warnings), production build, git diff whitespace checks passed.
- API unit/integration fixtures: Admin/Management allowed; no login 401, staff/cross-origin 403, production 404, malformed request 400, excessive context 413, exhausted budget 429, missing connector/ledger 503, provider failures 502.
- Disposable PGlite budget regression: staff denied, request spacing, token settlement, final RM19.50 reservation and refusal beyond RM20, browser roles cannot execute accounting.
- Hosted database: Admin authenticated RLS reads return 170 complaints, 166 jobs, 29 Daily Tasks and 526 active inventory items. No operational writes used.
- Hosted ledger initial read: zero requests, zero tokens, RM0 reserved. anon/authenticated accounting privileges false, service_role true.
- Existing database has no active management_viewer accounts; Management behavior is covered by endpoint tests, not a real Management login.

## Live deployment and remaining checks

Code deployment READY: `3058a243e27429e976155dc063c11461a87ae45d`.
Fixed test URL: https://klgcr-maintenance-system-git-feature-ai-assistant-v1-klgcr.vercel.app/admin/ai-assistant

The first deployment was verified with a real Admin login: AI navigation, desktop chat layout and durable budget display loaded successfully. A four-source question exposed an oversized context; the API safely rejected it before reserving budget or contacting Gemini. This was fixed by preserving aggregates while shrinking detail records to a 50,000-byte snapshot and discarding oldest history only when the full request exceeds 80,000 bytes. Source metadata reports the actual detail count. Endpoint regressions, TypeScript and production build passed after the fix; corrected Preview reached READY.

A new deployment hostname needs a distinct login session. Testing switched to the fixed branch alias to keep future updates on one hostname. The secure login request for this fixed alias was declined, so no further credential request was made.

Still pending: real Gemini answer on the corrected deployment, conversational follow-up, live model/quota confirmation, and mobile browser visual verification. Desktop appearance was reviewed on the preceding deployment with identical UI code. Management permission is tested in fixtures; no Management account currently exists. Google billing auto-recharge remains unverified. These are explicit pending items, not passes. Do not promote to main until they are verified and the user approves.
