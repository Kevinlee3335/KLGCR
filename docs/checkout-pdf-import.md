# UTMSPACE PDF intake

The Admin Check-out Rooms page offers **Upload PDF · Create Defect Forms** alongside the existing Excel and manual entry routes. Select the report, review the room list and English wording, then create the selected rooms. Imported rooms use the existing maintenance assignment, rectification, housekeeping and batch history workflow.

## Supported report

The parser reads the detailed `REKOD KEROSAKAN BILIK` / `BUTIRAN & BUKTI PEMBAIKAN` UTMSPACE report, including exported subsets. Summary-only and scanned reports are rejected rather than imported as empty records. The current import scope is Block A and B; other blocks are explicitly reported as skipped. Limits are 50 MB / 250 PDF pages, 50 source defects and 20 evidence photos per room. Oversized rooms cannot be partially saved.

Malay items and findings use explicit English mappings. Compound findings and inventory quantities are retained. Unknown terms, conflicting details, completed source findings and reused source IDs require review in the preview. Original Malay, original actions/status, source PDF fingerprint, page and references remain in provenance. No source report status or After/Recheck photograph marks a KLGCR repair completed.

## Evidence and saving

The browser reads the PDF and extracts its actual embedded photographs at their embedded resolution. Before, After (including numbered captions), and Recheck are taken from the report captions. Unsafe photo associations fail visibly. PDF.js and its matching worker are served from the installed, pinned dependency; no third-party PDF service or CDN receives the report.

Individual photos upload to Admin-owned staging. `import_checkout_pdf_room` checks role, block/room, source references and every uploaded photo's path, size, MIME type and defect index, then atomically saves one room, its defects, photos and history. A photo failure creates no partial room. Retrying a partly completed report saves only remaining rooms.

The idempotency key is `Block:CanonicalRoom:DF`, because the source report reuses DF numbers across rooms. It is stable across exports and batches. The importer skips existing active room aliases (for example `A103`, `A-103`, `103`), preserves their assignments and progress, and never rewrites archived history. End Batch and import share the existing lifecycle transaction lock.

Apply the immutable `20261127095849_checkout_pdf_report_import.sql` migration before releasing pages which select the provenance columns. No historical reports are automatically imported during migration or deployment. The user creates the chosen forms explicitly from the preview.

## Verification

Focused tests cover parser/translation, room-scoped photo association, upload failure/retry, edited English/original Malay, review confirmation, authorization and atomic database creation. The supplied first-five-room report was additionally exercised through the actual extraction/encoding function: 5 rooms, 21 defects and 17 original-resolution JPEGs. The complete supplied report produced 61 A/B rooms, 196 defects and 164 A/B photos, with T06 explicitly excluded. Private source PDFs and photos are not committed.
