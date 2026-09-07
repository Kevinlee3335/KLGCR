# KLGCR Enterprise CMMS Schema V2

## Migration summary

Migration `202609070001_enterprise_cmms_schema_v2.sql` is additive and preserves every existing table, column, RPC, policy, and workflow. It extends job and material-request lifecycle metadata, adds reusable operational child records, creates an immutable audit trail, and provides a reporting view. Existing UI continues to read the V1 fields unchanged.

## Relationship / ERD overview

```text
complaints 1 ─── 0..1 maintenance_jobs
                         │
                         ├── 0..* job_status_history
                         ├── 0..* job_appointments
                         ├── 0..* job_photos
                         ├── 0..* job_internal_notes
                         ├── 0..* material_requests ─── 1..* material_request_items
                         │             │
                         │             └── 0..* inventory_movements
                         └────────────────── 0..* inventory_movements

inventory_items 1 ─── 0..* inventory_movements
profiles        1 ─── 0..* lifecycle actor references
profiles        1 ─── 0..* audit_trail
```

### Maintenance lifecycle

`maintenance_jobs` remains the current-state aggregate. New actor/timestamp/reason fields support accept, pause, resume, verification, closure, and reopening without removing the existing assignment, start, completion, material, or monitoring fields. `current_stage` and constrained `progress` make operational reads and KPIs inexpensive.

A compatibility trigger synchronizes the stage, standard progress milestone, actor, and timestamp fields whenever the status changes. Existing V1 RPCs therefore keep the V2 aggregate current without modification.

`job_status_history` remains the immutable transition stream and now supports an explicit action, reason, and progress snapshot. Multiple appointments, categorized photos, and internal notes are normalized into child tables rather than repeatedly widening the job row.

### Materials and inventory

Material requests retain legacy `reviewed_at`, `reviewed_by`, and `rejection_reason` columns. New explicit approval, rejection, cancellation, and request fields are backfilled, while a compatibility trigger keeps them synchronized when existing RPCs run.

`inventory_movements` is the reporting ledger for every issue, receipt, and adjustment. It links directly to an inventory item and optionally to a job and material request. Existing issue and adjustment history is backfilled, and insert triggers keep the ledger current without changing existing inventory RPCs.

### Audit trail

`audit_trail` records actor, timestamp, module, record identity/number, action, old value, new value, and an optional remark. Server-side triggers cover maintenance jobs, status history, appointments, photos, internal notes, complaints, material requests, inventory items, and inventory movements. Authenticated clients cannot alter audit or movement history; audit reads remain restricted to Administrators through RLS.

## Reporting readiness

The `cmms_job_reporting` security-invoker view exposes lifecycle dimensions and response, working, and total durations for future KPI queries. Indexed foreign keys and event timestamps support completion-time averages, category and staff ranking, pending/monitoring workload, material usage, inventory consumption, and monthly aggregation without another structural redesign.

## Implementation notes

- New enum values are additive; current values remain valid.
- Tables, indexes, sequences, triggers, policies, and functions are guarded or replaced so an accidental complete rerun is non-destructive.
- Existing completed jobs are not assigned fabricated verification or closure events.
- Lifecycle timestamps and actors are nullable and should only be populated by real transitions.
- Photo records store a Supabase Storage path rather than public URLs, allowing signed-URL delivery later.
- The reporting view uses RLS-aware source access through `security_invoker`.
- Future transition RPCs should update the job aggregate and append `job_status_history` in one transaction.
