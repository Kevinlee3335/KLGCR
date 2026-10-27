# Inventory and signed purchasing release review

Status: locally implemented. Not pushed, deployed, or applied to the production database.

## Changes

- Inventory uses the existing Daily Tasks desktop hover and mobile expand pattern, with Building Material, Office Inventory and Cleaner Supplies.
- Inventory rows, search, issue history and adjustment history are separated by inventory group. Legacy items default to Building Material.
- Office uses OFF codes; Cleaner uses CLN codes. Google Sheet import rejects those namespaces and Google Sheet balance updates skip them.
- PO requester and approver signatures are restored with signature lines. Signed PDF cache keys use a new format version.
- One PO can contain only one inventory group. James approves Building Material. Mary approves Office Inventory and Cleaner Supplies. These checks run in database triggers as well as the UI.
- Quotation stores the preparer's saved signature and the approving admin's saved signature. Both the original single-item Excel layout and multi-item print layout show Prepared By and Approved By.
- Approval queues delivery once per PO revision. Building Material is addressed only to purchasing@keanlenggroup.com. Office supplier is disabled until explicitly confirmed. Both Kevin accounts are confirmed for Cleaner notifications. No personal email is inferred.
- Email currently contains the order item list and a sign-in-protected PDF link, not a PDF attachment.

## Import prepared

- Compared OFFICE STATIONARIES.xlsx with KLGCR_Office_Inventory_Item_Codes(1).xlsx.
- Prepared 40 rows, OFF-0001 through OFF-0040. Original specifications, packaging and quantity text are retained.
- Original zero balances take precedence over blank cells in the supplementary code workbook.
- OFF-0022 has missing quantity data. OFF-0024 and OFF-0025 use BOX balances and PCS minimums without a conversion. These are marked unverified and excluded from automatic reorder counts.
- The import only inserts missing codes. It does not overwrite existing codes.
- The import SQL remains private in the task workspace and is not part of the public repository commit.

## Validation

- 23 focused tests passed across purchasing, approval security, signatures, quotation numbering/printing and Google Sheet normalization.
- Additional category routing test covers confirmed and unconfirmed Office/Cleaner destinations using an isolated database; no real emails are sent.
- Import executed twice in an isolated database: 40 Office rows, no duplicates, original Building balance unchanged. Fractions and packaging conversions checked.
- TypeScript and production build passed. Existing unrelated lint warnings remain.
- Signed PO PDF and single-item Quotation SVG visually inspected.
- Authenticated browser end-to-end validation on a deployed preview remains outstanding. The local Playwright browser executable is unavailable.

## Required before production

1. Approve publication of this exact feature branch to the public Kevinlee3335/KLGCR repository; automatic approval review blocked the push.
2. Obtain a successful Vercel preview and complete authenticated checks, without approving real orders or sending test purchases.
3. Apply the tested additive migration and insert-only import, verifying the original 526 inventory rows against the captured baseline.
4. Confirm the Office supplier email; keep Office email delivery disabled until resolved. Both Kevin accounts were confirmed by the user.
5. Publish only after the preview and database checks pass. Do not replay historical approvals or send historical purchase emails.
