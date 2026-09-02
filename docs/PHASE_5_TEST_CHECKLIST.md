# Phase 5 – Automation, Reports & Google Import

## What Phase 5 adds

1. Google Form / Google Sheet CSV import into **New Complaints**.
2. Google Drive photo / attachment link stored with the complaint.
3. Daily Task scheduling for active maintenance jobs.
4. Automatic report history using Supabase Cron:
   - 9:00 AM Malaysia – Morning Daily Task (AB and CD separately)
   - 12:00 PM Malaysia – Midday Update (AB and CD separately)
   - 4:50 PM Malaysia – Daily Summary (AB and CD separately) + Inventory Report
   - 3-hour Progress Snapshots between the dedicated reports
5. Manual report generation.
6. WhatsApp-ready copy text. No WhatsApp API or automatic sending.
7. CSV and Excel-compatible report export.
8. Notification / Attention Centre for New Complaints, Pending Material, Under Monitoring, Out of Stock and Near Reorder.

## Workflow rule kept unchanged

Google responses do **not** become jobs automatically.

Google Form / Sheet → Import → New Complaint → Admin Review → Assign Staff → Maintenance Job → Daily Task schedule → Staff workflow.

Existing Phase 1–4 job status rules and material/inventory workflow remain unchanged.

## Google Sheet columns

Required headings:
- Block
- Room
- Category
- Description

Optional headings:
- Name
- Contact
- Priority
- Photo URL
- Response ID
- Timestamp

Duplicate imports are skipped using Response ID when available, otherwise a stable row fingerprint.

## Test checklist

- [ ] Run `supabase/migrations/202609020001_phase5_reporting_automation.sql` in Supabase SQL Editor once.
- [ ] Admin can open Google Import.
- [ ] Import one test CSV / pasted Sheet row.
- [ ] Imported row appears under New Complaints, not Maintenance Jobs.
- [ ] Google Drive Photo link opens from Complaint Review.
- [ ] Admin reviews and assigns the complaint normally.
- [ ] Admin schedules the new job in Daily Tasks.
- [ ] Manual 9AM / 12PM / 4:50PM / Progress report can be generated.
- [ ] AB and CD reports are separate.
- [ ] Copy WhatsApp Text copies the full summary.
- [ ] CSV export downloads.
- [ ] Excel export downloads and opens in Excel.
- [ ] Inventory Report shows Out of Stock and Near Reorder data.
- [ ] Notifications page counts items needing attention.
- [ ] Existing Staff job completion / monitoring / pending material workflow still works.

## Automatic schedule

Supabase `pg_cron` is enabled by the Phase 5 migration and creates four named schedules. This avoids relying on higher-frequency Vercel Cron plan limits.
