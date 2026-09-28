# September review batch — not released

Branch: `fix/september-14-items`. Production database and production deployment have not been changed. Review the whole batch before release.

| Item | Implemented | Remaining acceptance check |
| --- | --- | --- |
| 1 | Remove dashboard Pending Confirmation card; preserve appointment workflow | Dashboard preview |
| 2 | Transfer jobs, preserving progress and assignment history | Admin transfer between eligible employees |
| 3 | External-area choices; remove visible category and Google Form/Flex source choices | Check location labels and complaint review |
| 4 | Daily task assignee and employee task list | Confirm scope: conversation later says “第4取消”; confirm whether this refers to this feature or an email list before release |
| 5 | 9:30 AM / 4:50 PM Malaysia reports, readable newlines, defect descriptions and pending material names | Compare scheduled/manual output with real records |
| 6 | Other material name, admin visibility and stock matching before issue | Request → match purchased stock → issue |
| 7 | Normalize Sheet item codes; detect rejected sync and allow retry without another deduction | Deploy Apps Script changes and verify real Google Sheet |
| 8 | Fix certificate type value and provide existing-record date editing | Owner must supply correct certificate/servicing dates; no dates guessed |
| 9 | Weekly/monthly recurring assignments with duplicate protection | Review recurring task dates and employees |
| 10 | Calendar notifications to all, one or selected employees | Real phone subscription/delivery test |
| 11 | Disable material-request email; keep app/push notifications | Verify existing other email workflows remain wanted |
| 12 | Inventory search escaping and visibility of uncategorized stock/balances | Search user's affected item |
| 13 | Rejected/deleted complaint filters and future deletion archive | Previously hard-deleted records cannot be recovered by this change |
| 14 | Signed maintenance photos below completion timeline events | Real uploaded-photo preview |

## Validation

- 134 tests passed, zero failures; final TypeScript check passed.
- Production build passed before the final small report error-display change; that change passed final TypeScript and test checks.
- Five integration tests execute the migration in isolated PGlite PostgreSQL: transfers/permissions, Other materials/atomic issue, recurring tasks, reports and deletion archives.
- UI tests cover external-area fields, recipients, Other input and completion photos. Google sync tests use mocked responses. No real email or push notification was sent by these tests.
- No browser end-to-end or remote migration validation has been completed.

## Deployment dependencies and decisions

- Migration: `supabase/migrations/20260928070041_september_review_batch.sql`. Apply to an isolated test database first. Do not apply to production before review.
- Vercel connector returns 403 for deployments; team projects list is empty. Web fallback requires user approval under the connection-tool rules.
- Supabase has no existing test branch. Do not create a paid branch without cost approval or point an unverified preview at production write credentials.
- Google Apps Script update is in `docs/google-inventory-apps-script.gs`; it is not deployed.
- External areas retain a responsible block for assignment/report scope and store the area in the location text. Existing imported Google Form/Flex sources are preserved.
- A monthly day beyond the current month's length runs on its last day. Stopping a recurrence preserves already-generated tasks.
- Existing midday/progress report schedules remain; only the requested morning time changed.
- Production security advisors were read as a baseline, not as validation of this unapplied migration. Existing warnings were not changed as part of this scope.

Release only after scope/date confirmation, isolated migration and browser review, Google Sheet and phone checks, and the owner's single batch acceptance.
