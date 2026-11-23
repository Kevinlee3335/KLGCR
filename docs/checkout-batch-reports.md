# Check-out batches and reports

The current Dashboard covers one open batch. Admin uses **End Batch** to review
room readiness and unresolved material requests. Successful closure creates a
one-page A4 Summary and a complete A4 PDF in **Documents > Check-out Batch
Reports**, archives the batch and opens an empty batch for the next turnover.

The initial migration groups existing room records into COB-2026-0001. It keeps
all original room dates and stock balances. Soft-removed records remain in the
full snapshot and are labelled separately from operational room totals.

## Close and retry

- `prepare_checkout_batch_close` serializes mutations, checks ready rooms,
  unresolved defects and active painting work, then saves an immutable snapshot.
- Unissued request lines require explicit checkbox confirmation. Original
  request/approval history remains; closure decisions are audited. These lines
  never count as issued stock and never deduct inventory.
- Both PDFs must exist in private Storage before `finish_checkout_batch_close`
  registers them in Documents and resets the Dashboard. Failed uploads or report
  generation leave the batch resumable in `closing` state. Retrying does not
  create duplicate reports, batches or stock movements.
- The original 30-day inspection lookup intentionally reads archived rooms.
  Operational queries and daily summary totals exclude `batch_archived_at` rows.

## Materials

Room material issues come from `inventory_issue_history`. Batch Stock Out uses
an explicit batch selector in Inventory and writes a linked stock adjustment.
Building, Cleaner and Office items remain distinct, as do inventory IDs and
units. No usage is inferred from a request or approval alone.

Initial stock-out attribution only links notes explicitly naming check-out work
(including the historical CHCEK OUT spelling). Other-purpose stock is excluded.
Direct stock-outs identify the collecting person and recording admin; no
separate approval is invented where the original record has none.

Returns validate the source and remaining issued quantity, restore stock once
using an idempotent return UUID, retain the recipient/receiver/reason and update
batch net totals. Net means issued less recorded returns; unreturned stock is
not independently confirmed consumption. Building inventory changes retain the
existing Google Sheet sync path.

## History and evidence

The snapshot contains all room checklists, defects, work events, painting tasks,
material requests/decisions, issues, stock-outs, returns and photo metadata with
recorded actor names. Full PDF generation embeds all saved photos and fails
visibly if a photo cannot be retrieved. Report-only JPEG resizing does not
change original evidence files. Photo compression is bounded to fit the existing
50 MB Documents limit.

Batch History provides original PDFs and room-level details. Closed records and
PDFs cannot be modified/deleted through operational actions. Historical evidence
remains available to management, including evidence from soft-removed rooms.

## Validation

Database tests cover role checks, insufficient/excessive returns, duplicate
return and close requests, unfinished/unissued work, missing PDF uploads,
immutable archived data, reset totals, retained recent inspections and the next
batch. PDF tests cover pagination, all photos, exact quantity arithmetic and a
single-page summary. Inventory and Documents regression tests cover the new
batch purpose selector and report folder.
