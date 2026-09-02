# Google Form Direct Integration

Phase 5 uses the existing Google Form and its existing response spreadsheet: `KLG MAINTENANCE REPORT - 2026 (Responses)`.

## Required flow

Existing Google Form -> existing response Sheet -> KLGCR webhook -> `complaints` as `new`.

The integration must never auto-assign staff or auto-schedule a Daily Task. Admin Review remains mandatory.

## Existing response columns

- Timestamp
- Email Address
- NAME
- BLOCK
- ROOM NUMBER / COMMON AREA
- PHONE NUMBER (WHATSAPP)
- EMAIL ADDRESS
- MAINTENANCE TYPE
- REPORT DESCRIPTION
- PHOTO (IF APPLICABLE)
- ROOM AVAILABILITY (DATE)
- ROOM AVAILABILITY (TIME)
- REQUEST FOR ROOM ACCESS DUE TO TENANT'S UNAVAILABILITY
- REPORT STATUS (KLG)
- NOTE (IF APPLICABLE)

## Integration approach

Use an installable Google Apps Script `onFormSubmit` trigger attached to the existing response spreadsheet. The script POSTs only newly submitted rows to a protected KLGCR API endpoint. The endpoint validates a shared secret, normalizes the form fields, deduplicates submissions, and inserts a new complaint.

Existing historical rows must not be bulk-imported by the automatic trigger.
