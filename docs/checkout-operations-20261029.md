# Check-out operations update

Check-out maintenance can request materials using the existing approval and inventory workflow. Requests carry exactly one origin: a maintenance job or a check-out room. Issuing is transactional, locks inventory deterministically, rejects unmatched Other items, and preserves the original job workflow. Google Sheet synchronization still runs only after Issue.

Admin check-out pages now include team totals, selected-date completion counts, a cleaner status table, and a printable team report. The report snapshot trigger appends these sections to manual and automatic 4:50 PM daily summaries for each block group. Existing snapshots are unchanged. Dates use Asia/Kuala_Lumpur. Historical date selection shows the current state of records created through that date plus completions on the selected date; it is not a reconstruction of earlier states. Historical issued reports remain the authoritative historical snapshots.

The General Worker painting list includes Room and Bathroom candidates, supports room/defect/area/status/worker filters, and can print or save PDF. Admins can assign or transfer work by worker name and update its status without creating worker accounts. Every update is audited. Painting completion does not bypass the maintenance evidence or final verification workflow. All defects can be shown to manually include candidates not detected from wording.

Assigned maintenance and cleaner pages now show private signed inspection/completion/cleaning evidence, including photos uploaded by Admin. Signing or loading failures are visible.

## Validation

- 20 focused tests passed across 10 suites, including real PGlite SQL execution of the migration, ownership checks, inventory deductions, duplicate issue rejection, insufficient-stock rollback, normal maintenance-job issue compatibility, painting permissions, MYT date grouping, deleted-room exclusion, and immutable report snapshots.
- TypeScript and production build passed. ESLint has no errors; existing image and hook warnings remain.
- Live Supabase evidence-read policy inspected: current assignee, cleaner and management can read the private checkout-evidence bucket.

## Rollout

Production has not been changed. Direct push to main was rejected by automatic approval review; this work is prepared on a feature branch for explicit release approval.

Before merging/deploying, apply `20261029023606_checkout_operations.sql` to the KLG CAMPUS RESIDENCE project, then verify the new functions and constraints. This additive migration must be installed before new application code goes live: material request pages query the new checkout relation. Vercel preview deployments using the unchanged production database cannot fully exercise these features until a matching database is supplied.

After release, verify with an existing authenticated Admin and assigned staff session: inspection photo display, a check-out material request, approve/issue and Google Sheet sync, cleaner dashboard/report, General Worker filters and audit history. Do not issue production stock merely to test. Verify the next generated daily summary includes CHECK-OUT ROOMS without changing historical snapshots.
