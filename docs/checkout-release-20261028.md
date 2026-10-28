# Check-out Rooms release — 28 October 2026

Changes:
- Shared black/gold action buttons with hover, focus, disabled and reduced-motion states.
- Check-out Progress Table and room detail progress: rectified real defects / all real defects, rounded to a whole percentage. Explicit No Defect markers are retained but excluded from repair counts.
- No Defect rooms can be assigned directly from second inspection to an active Cleaner. Normal rooms require completed repairs and admin verification before housekeeping handover.
- Partial repairs stay in rectification. The last repair moves the room to verification. Open defects prevent final readiness. Stale handovers and cleaning submissions cannot append false completion history or send a success notification.
- Existing historical Ready records with outstanding defects show an admin review notice; no historical state is rewritten.

Validation:
- Full suite: 136 files passed, 621 tests passed, 1 skipped (`npx vitest run --maxWorkers=2 --testTimeout=20000`).
- Additional focused coverage: 6 tests passed for server-action flow and No Defect picker, including partial repair, all repairs, housekeeping, final readiness, invalid assignee, outstanding repair and duplicate handover protection.
- Server-action flow uses an isolated in-memory Supabase test double, including photo upload and notification mocks; no production test records or notifications are created.
- Production Supabase project is ACTIVE_HEALTHY. All four checkout tables have RLS enabled. Baseline: 20 rooms, 68 defects, 28 photos, 46 history entries. No database migrations or production data writes are needed.
- Public /admin/checkouts correctly redirects unauthenticated requests to /login, which returns HTTP 200. An authenticated live UI workflow has not been exercised.

Existing data finding: KLGCR-COR-17F112F4 / Room 222 is already marked ready_for_occupancy, but Bathroom · Window Handle — Broken is still open (3 of 4 repairs rectified). Preserve the original record for management review; do not automatically assert the repair was completed.

The Supabase project-wide advisor also reports existing SECURITY DEFINER execution warnings and disabled leaked-password protection; this release does not change those unrelated settings.
