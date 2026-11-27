# UTMSPACE PDF intake

The Admin Check-out Rooms page offers **Upload PDF · Create Defect Forms** alongside the existing Excel and manual entry routes. Select the report, review the room list and English wording, then create the selected rooms. Imported rooms use the existing maintenance assignment, rectification, housekeeping and batch history workflow.

## Supported report

The parser reads the detailed `REKOD KEROSAKAN BILIK` / `BUTIRAN & BUKTI PEMBAIKAN` UTMSPACE report, including exported subsets. Summary-only and scanned reports are rejected rather than imported as empty records. The current import scope is Block A and B; other blocks are explicitly reported as skipped. Limits are 50 MB / 250 PDF pages, 50 source defects and 20 evidence photos per room. Oversized rooms cannot be partially saved.

Malay items and findings use explicit English mappings. Compound findings and inventory quantities are retained. Unknown terms, conflicting details, completed source findings and reused source IDs require review in the preview. Original Malay, original actions/status, source PDF fingerprint, page and references remain in provenance. No source report status or After/Recheck photograph marks a KLGCR repair completed.

## Evidence and saving

The browser reads the PDF and extracts its actual embedded photographs at their embedded resolution. Before, After (including numbered captions), and Recheck are taken from the report captions. Unsafe photo associations fail visibly. PDF.js and its matching worker are served from the installed, pinned dependency; no third-party PDF service or CDN receives the report.

Individual photos upload to Admin-owned staging. `import_checkout_pdf_room` checks role, block/room, source references and every uploaded photo's path, size, MIME type and defect index, then atomically saves one room, its defects, photos and history. A photo failure creates no partial room. Retrying a partly completed report saves only remaining rooms.

The idempotency key is `Block:CanonicalRoom:DF`, because the source report reuses DF numbers across rooms. It is stable across exports and batches. The importer skips existing active room aliases (for example `A103`, `A-103`, `103`), preserves their assignments and progress, and never rewrites archived history. End Batch and import share the existing lifecycle transaction lock.

## Large reports and accuracy checks

Every included A/B room is independently reconciled against its own source header, declared Kerosakan count, DF table and detailed DF sections. Missing pages or references, malformed headers, contradictory locations and incomplete findings/status block the file before any room is created. The global room total is not a requirement for a deliberately extracted report: five complete room sections from a 75-room run remain valid. Unknown translations and source ambiguities still require explicit review.

The browser yields between pages and photographs and during pixel conversion so progress can paint and Cancel can be handled. Photo conversion retains the original embedded resolution and the same JPEG quality. Abort/error paths clear canvases and terminate the PDF reader. Progress reports actual pages and photo counts, not a fabricated completion percentage.

The report's Before/After/Recheck captions are reconciled separately against extracted photographs or their own nearby, same-column `Tiada gambar` placeholder. This prevents a PDF decoder's partial image result from being mistaken for a source report with no photograph. A placeholder from another defect or room cannot cover a missing image. The 24-million-pixel image limit remains in place; a missing/undecodable photo blocks the upload before forms are created.

Only expanded preview rooms mount their defect editors and photo elements; collapsing a room releases its preview URLs without losing its edits, review confirmations or saved outcome. Outstanding reviews are identified on the room summary. Before the first server action, every selected room passes the full import schema, preventing a predictable validation error in a later room from causing an avoidable partial batch.

Apply the immutable `20261127095849_checkout_pdf_report_import.sql` migration before releasing pages which select the provenance columns. No historical reports are automatically imported during migration or deployment. The user creates the chosen forms explicitly from the preview.

## Verification

Focused tests cover parser/translation, room-scoped photo association, upload failure/retry, edited English/original Malay, review confirmation, authorization and atomic database creation. The supplied first-five-room report was additionally exercised through the actual extraction/encoding function: 5 rooms, 21 defects and 17 original-resolution JPEGs. The complete supplied report produced 61 A/B rooms, 196 defects and 164 A/B photos, with T06 explicitly excluded. Private source PDFs and photos are not committed.

The large-report follow-up additionally verified a generated 200-page report with 200 rooms and 600 defects, as well as 100/200-room lazy-preview tests. All real-report JPEGs were compared byte-for-byte with the pre-optimization output. Runtime measurements use PDF.js with a Node canvas adapter and do not represent on-site phone or network upload timings.

A negative test keeps all five real source rooms and their DF tables/details intact while changing one photograph's PDF dimensions above the image limit. Structural room checks still pass, and the independent photo-caption check correctly rejects that omitted photograph. No source PDF or test photograph is sent to production for this verification.
