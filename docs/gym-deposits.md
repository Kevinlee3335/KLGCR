# Gym cash deposits

This flow records the refundable RM10 cash deposit separately from RM40 membership payments. It is available from Membership → Deposits & refunds and each member's detail page. Documents contains Deposit Receipts and Payment Vouchers folders.

## Receive cash

1. Open the Non Residence member.
2. Receive RM10 cash, then choose **Receive RM10 cash deposit**.
3. Check the collection date and save. The system issues an A5 Deposit Receipt, archives its PDF and queues the member email.
4. Check the document's PDF and email status. A failed email does not cancel the deposit. Retry the same document rather than receiving the money again.

Only one held Gym deposit is allowed per member. Staff, member, amount, date and document number are saved atomically. Deposit entries do not count as membership revenue.

## Record a handwritten deposit already held

Choose **Record existing deposit**, enter the original receipt number and original collection date, and save. This records an opening balance without recording new cash, adding a second payment-list entry or sending a new-cash receipt email. The archived document is marked **Existing Deposit Record**.

## Refund cash

1. The employee who returns the cash signs in using their own account and saves their staff e-signature if needed.
2. Return RM10 to the member, then choose **Record RM10 refund** on the held deposit.
3. The system records one refund, issues the A5 Payment Voucher and queues its email.

**Members do not sign or acknowledge refunds in the current version.** The PV states `The recipient's signature is not required for this payment voucher.` It contains the actual employee's **Refunded by** name, their saved e-signature and the K HOTEL seal. There is no separate refund date/time field; the ordinary document date and internal audit timestamp remain.

Member signature-pad support is deferred until the device is purchased. This release does not add tablet drivers, hardware integrations, member signature fields or email acknowledgements.

## Numbering and records

- New deposit receipts start at `KLGDR-2600001`; payment vouchers start at `KLGPV-2600001` in 2026.
- Each prefix has an annual five-digit sequence shared across future modules. In 2027 the first numbers are `KLGDR-2700001` and `KLGPV-2700001`.
- A receipt has at most one refund PV. Duplicate requests reuse its original PV, original refunding employee and original signature.
- Issued financial fields and archived PDF paths are immutable. PDF and email retries do not allocate another number or change the cash state.
- PDFs are private. Admins manage records; Management Viewers can view and download them.
- Pending documents are attempted immediately after saving. The existing membership cron retries a bounded batch; staff can also retry a failed PDF or email from its list entry.
- Delivery uses the email address saved when the document was issued. Invalid recorded addresses require Management review rather than repeated cash entries.

## Release

Apply `supabase/migrations/20261125065415_gym_deposit_documents.sql` before deploying the application changes. It creates service-only tables/RPCs and a private `deposit-documents` bucket. It does not import existing balances automatically. Existing member, payment and staff signature data remain the source of identity.

Use the existing Gmail finance gateway and membership cron configuration. No new paid service or signature device is required for this release. Do not use real member cash records or send real member email to test a deployment.
