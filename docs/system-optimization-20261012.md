# KLGCR system optimization — 12 October 2026

Status: review branch only. Production database was queried read-only; no records,
objects, grants, policies, schedules or migrations were changed. No production
deployment or merge is included in this change.

Baseline: `18f0bbf7c1e29b6f9be1d08e97dfabb1a3ab40fc`, including the Documents
release. Reviewed `KLGCR_PROJECT_BASELINE.md` (1 October) and the later decisions
visible in the project conversation. Current working behavior takes precedence
over older baseline entries; this branch does not change staff allocations.

## Implemented

| Area | Change | Evidence / practical limit |
|---|---|---|
| Check-out Rooms | Load Excel parser only when a file is selected | Next production build First Load JS: 292 kB → 182 kB, about 38% less. The parser and import rules are unchanged. |
| Photo galleries | Batch private signed URLs in groups of 100, deduplicate paths, retain all rows and ordering | 120 distinct photos use 2 signing requests instead of 120. Same private buckets, same authenticated client, same one-hour expiry. No public access or global URL cache. |
| Photo failures | Preserve valid photos and retain existing Job Detail warning; use bounded single-file fallback if the batch API fails | Tests cover missing photos, out-of-order responses, duplicates and fallback concurrency (maximum 4). |
| Photos on Daily Tasks and Check-out Room Detail | Browser loads images as they approach the viewport and decodes asynchronously | Full original images and links remain available; original uploads are untouched. |
| Reports / Material Requests / Job Detail | Start independent database requests together | All original filters, limits, sort order, relationships and role checks remain identical. Server waits on the slowest independent query instead of summing each wait. No production latency claim without signed-in measurements. |
| Documents | Cache normalized filenames between renders; compute search words once | Same filename search, selected files, upload, preview, download and delete controls. |
| Malaysia time | Reuse read-only Intl formatters for common table and timeline timestamps | Same format, timezone and date inputs. No timestamps are rewritten. |
| Notification bell | Mark notifications read only after the database accepts the write | A failed write leaves the unread indicator intact and allows retry. Recipient filter is preserved. This is not a claim that Daily Task / Sub Task push delivery is fixed. |
| PWA metadata | Move unchanged theme color to Next's supported viewport export | Removes the unsupported themeColor build warnings while retaining the same color. |

## Validation

- Baseline: typecheck and 169 existing tests passed before implementation.
- Updated: typecheck passed; all 175 tests passed after implementation. Two additional
  Job Detail regression tests subsequently passed (177 total tests in the suite).
- `npm run build` passed. Comparison builds used the same installed dependency tree.
- `npm run lint` passed with 0 errors and the four existing raw-photo image warnings.
- `git diff --check` passed.
- Gallery regressions confirm completion timeline links remain in photo order and
  a missing file does not hide the job or valid photos.
- Database checks: read-only performance/security advisors, table statistics and
  index definitions. Counts in pg_stat_user_tables are estimates, not a backup.
- No production data mutation was used for testing. Database regression tests run
  against disposable PGlite fixtures, not the hosted database.

## Remaining findings requiring a separate, verified change

These findings are recorded rather than silently changing working permissions,
dependencies or database behavior in a performance patch.

1. **Database indexes:** performance advisor reports 51 foreign keys without covering
   indexes. Several tables are currently small, so adding every index blindly is
   unwarranted. The following missing indexes match actual evidence/detail queries
   and are candidates for a separate chronological migration:

   | Table | Candidate columns | Reason |
   |---|---|---|
   | maintenance_job_photos | job_id, created_at | Completion timeline evidence |
   | checkout_photos | checkout_room_id, created_at | Room evidence |
   | checkout_history | checkout_room_id, created_at | Room history |
   | checkout_defects | checkout_room_id, created_at | Room defect register |

   Verify query plans on a test database first. No existing index is removed and no
   production index is created in this branch.

2. **RLS and privileged functions:** advisor flags overlapping permissive policies,
   7 anonymous-callable and 31 authenticated-callable SECURITY DEFINER functions.
   These are review signals, not proof that the functions leak data. Check each
   function's ownership/auth guards and intended webhook/cron use before changing
   EXECUTE grants. Do not combine or remove policies without role regression tests.
   [Advisor details](https://supabase.com/docs/guides/database/database-linter).

3. **Password protection:** leaked-password protection is reported disabled.
   Enabling it changes acceptance of some passwords and needs deliberate testing.
   [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

4. **Dependencies:** production `npm audit` reported 5 affected package entries
   (Next, PostCSS, Sharp, source-map-js and xlsx), 4 high and 1 moderate. Audit
   dependency entries can overlap and are not 5 confirmed exploitable application
   defects. xlsx has no npm audit automatic fix. Validate upstream patched releases
   and Excel compatibility separately; no `npm audit fix --force`, framework
   upgrade or parser replacement was performed.

5. **Phone push:** a phone delivery check needs an actual subscribed device plus
   assignment/completion tests for the main Daily Task and each Sub Task. Unit
   tests and a bell badge cannot confirm delivery to a closed iPhone PWA. Preserve
   the ongoing notification fix independently of this optimization branch.

6. **Hosted verification:** Vercel project discovery worked but deployment listing
   returned HTTP 403. No local Vercel CLI was installed. GitHub commit statuses can
   show deployment build results; that alone does not verify signed-in browser,
   API, database and phone delivery boundaries.

## Review checks before production release

- On desktop and phone, open Admin / Operation / Housekeeping Task lists and keep
  historical search, staff filters, status filters and photo evidence visible.
- Check a completed Maintenance Job with multiple photos and its full timeline.
- View Daily Task and Check-out Room evidence as the intended roles.
- Open Reports with date/block/staff filters and compare output with production.
- Search Documents, preview/download existing files, and test Excel import using
  a disposable test database so no production room is created.
- Test notification read failure/retry and keep new notifications unread.
- Merge/deploy only after Kevin's explicit release instruction.
