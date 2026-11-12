# Review existing Cert, Servicing and Agreement data

Keep the original workbook and the production snapshot in a private workspace. The workbook supplies the print layout and the dates recorded in its worksheets. The production snapshot supplies existing record IDs and current values.

Export the current comparison rows as a JSON array from a read-only query.

```sql
select id, record_type, title, provider, reference_no, next_due_date,
       last_completed_date, status
from public.compliance_records
order by record_type, title, id;
```

For suggested supplier links, also export `select id, name from public.supplier_mail_suppliers` as `suppliers.json`.

```sh
node scripts/compliance-workbook-plan.mjs workbook.xlsx production-records.json suppliers.json > workbook-import-plan.json
TZ=Asia/Kuala_Lumpur node --test scripts/compliance-workbook-plan.checks.mjs
```

The plan selects the latest dated Cert & License and Servicing sheets and the Agreement Renewal sheet. It includes earlier expiry dates from prior Cert snapshots, every identified servicing schedule with its source rows, and loose servicing dates whose titles need review. Inherited Excel cells carry their exact anchors for print mapping.

1. Check each proposed production ID against the provider, equipment and location. Preserve the verified existing ID. Review the candidate list when a worksheet row has a similar title or a different scope. Check cross-sheet contract flags before creating an Agreement from a contract already listed in Cert & License.
2. Confirm which due date belongs to the open cycle. Check any difference between the workbook and production. Preserve previous expiry dates in history with their source, and record the actual performed date and evidence separately. If the date is missing or partial, leave it pending confirmation.
3. Confirm the supplier and required documents for each record. Where a servicing invoice is conditional on charges, check the actual job. Worksheet remarks can guide the evidence review.
4. Confirm each `template_row` before binding. Where a due cell is merged across assets, review the shared Excel date before changing it on the printout.
5. Apply reviewed changes through the Cert & Servicing workflow. Keep all unmatched production records and leave any disputed row out of the update until its identity is resolved.

The script reads the workbook and comparison snapshots and outputs a reconciliation plan. It leaves production records and worksheet contents intact.

## Activate the linked workflow

Apply the linked compliance migrations together with the matching application deployment. The cycle migration moves record edits to validated server actions, so run it during the application cutover. Existing record IDs and their current due dates carry over.

In Cert & Servicing, open **Print template** and upload the original workbook privately. Use the coverage table to bind outstanding records. Print the downloaded workbook in Excel to use the original page setup.

Use the company Gmail supplier archive for incoming PDFs. On the compliance record, confirm the supplier PDF and the open cycle, or upload a PDF directly. An approved combined invoice can be linked to more than one cycle with a single outgoing approval email. For an individually billed job, set **Invoice required this cycle** in the work progress form. This leaves the next cycle on the record’s usual requirements.

The existing company Gmail script must be current for automatic supplier intake. Deploy the updated existing noreply gateway version from `public/billing-mail/gateway.gs` for quotation and invoice approval emails. Keep its deployment URL and settings. The site checks the gateway before sending.

Verify with a sample record that work progress saves before an invoice arrives, missing evidence keeps the cycle open, the review is routed in the required order, completion opens the next cycle with its due date, and old PDFs remain accessible from history. Check the reminder schedule against Malaysia dates and verify phone push with an active Admin subscription.
