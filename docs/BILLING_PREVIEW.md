# Rental & Utilities preview

Route: `/admin/billing`; separate branch `feature/rental-utility-billing-test`.
Production and main do not expose the module. Admin and Management Viewer use
existing authentication; other roles are rejected at the API and database.

Tenant and meter data were imported privately from the uploaded files into new
RLS-protected `billing_preview_settings`. They are absent from public source and
client bundles. Test fixtures are anonymized. No operational records were edited.

## Test workflow

- Rental invoices: choose the month, review tenancy dates/rent, preview the pack.
- Utilities: October 2026 initially bills the September sample usage; edit the
  current reading, optionally upload a photo, check it and save. All readings must
  be confirmed before generation. Shared physical meters stay linked.
- Each meter has separate camera and gallery buttons (native rear camera on phones; webcam preview on desktop). A captured/uploaded
  photo saves automatically BEFORE OCR. The suggested reading then saves with
  confirmation false. An OCR failure leaves the saved photo and clears the old
  current reading. Changing the month carries the confirmed photo forward.
- Photo AI uses the existing Gemini Preview key and conservative AI budget ledger.
  If configuration/quota is unavailable, manual entry remains available. Live OCR
  has not been verified on this billing branch.
- Schedule: enable TEST schedule, enter reviewed holiday coverage and all observed
  holidays. Save. Simulate a date/time; Sundays and listed holidays are skipped.
  Saturdays remain eligible. Example: November 1 2026 is Sunday, adding November
  2 as a TEST substitute holiday produces November 3. November 2 is not represented
  as an actual Johor public holiday.
- Generate test rental pack saves one immutable pack per month. Same-month
  generation is rejected by a unique database constraint; no automatic print call.
- Utility packs are also immutable per month. Next-month readings are prepared
  only from the saved confirmed pack. Saving settings uses an optimistic revision
  check to prevent silently overwriting another user's changes.
- Print / Save PDF opens a TEST invoice pack in a browser; printing is manual.

## Deliberately disabled / remaining

Live unattended scheduling and office printer submission are not activated in a
Vercel preview. Production cron plus office Print Agent need a separate verified
integration before release. No claim is made that the preview reaches a LAN
printer. Only a subset of the 2026 holiday calendar is prefilled; new years and
special announcements need review. This first integration does not yet include
the original tool's complete renewal/archive forms or full photo edit auditing.
Utility invoice and statement layouts now use sanitized vector backgrounds
exported directly from the supplied Excel files. Original lines, logo positions,
fonts and static text are retained. Dynamic fields are filled at the source
coordinates. Rental invoices follow the supplied HTML template. Photo sheets
show previous/current photos and readings in the original four-column structure. Original Python and HTML files are untouched.

## Validation

- TypeScript, ESLint and Next.js build pass.
- Five billing logic tests cover Sundays, substitute/consecutive holidays,
  Saturdays, reviewed coverage, Malaysia time, proration, actual invoice date,
  five rent totals and all ten source utility totals.
- Six API authorization tests cover signed-out/staff access, production disabled
  and Admin/Management cross-origin writes.
- Live SQL rollback test verifies Admin reads the test config, Cleaner and
  Maintenance cannot, anonymous has no grant, snapshots have no update/delete grant.
  No active Management Viewer profile exists, so its live RLS case was not run.
- Complete authenticated browser workflow, real photo OCR and office paper output
  require subsequent verification. All initial test settings remain disabled.

Official holiday reference: https://www.johor.gov.my/rakyat/cuti-umum-2

Additional checks: camera/gallery controls, save-before-OCR, successful auto-save,
OCR failure retaining the photo, and original print templates are covered by five
additional tests (16 billing tests total). Camera hardware and live OCR still need
an actual phone test.
