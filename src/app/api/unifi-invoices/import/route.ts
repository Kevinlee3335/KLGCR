import { after, NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { dispatchDocumentReviewPushes } from '@/lib/document-review-notifications';
import { unifiFirstBillingMonth, unifiFirstPage, unifiInvoiceDetails, unifiManualPdfLimit } from '@/lib/unifi-invoice-pdf';
import { storeUnifiInvoice, unifiInvoicePath } from '@/lib/unifi-invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') return new Response('Forbidden', { status: 403 });

  const finish = (key: string, value: string) => {
    const url = new URL(unifiInvoicePath, request.url);
    url.searchParams.set(key, value);
    return NextResponse.redirect(url, 303);
  };
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const month = form?.get('billingMonth');
  const suppliedNumber = form?.get('invoiceNumber');
  if (!(file instanceof File) || file.size > unifiManualPdfLimit) return finish('error', 'Choose an invoice PDF up to 4 MB.');
  if (typeof month !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) || month < unifiFirstBillingMonth) {
    return finish('error', 'Choose an invoice month from September 2026 onward.');
  }
  try {
    const bytes = await unifiFirstPage(new Uint8Array(await file.arrayBuffer()));
    const details = await unifiInvoiceDetails(bytes).catch(() => null);
    if (details?.period && details.period !== month) return finish('error', 'The selected month differs from the month printed on the bill.');
    if (details?.invoiceNumber && typeof suppliedNumber === 'string' && suppliedNumber.trim()
      && details.invoiceNumber !== suppliedNumber.trim().toUpperCase()) {
      return finish('error', 'The invoice number differs from the number printed on the bill.');
    }
    const invoice = await storeUnifiInvoice({
      period: month, source: 'manual', fileName: file.name, bytes, createdBy: profile.id,
      invoiceNumber: details?.invoiceNumber ?? (typeof suppliedNumber === 'string' ? suppliedNumber : undefined),
      accountNumber: details?.accountNumber ?? undefined,
      dueDate: details?.dueDate ?? undefined,
    });
    if (invoice.created) after(async () => { await dispatchDocumentReviewPushes(invoice.id).catch(() => {}); });
    return finish('imported', '1');
  } catch (error) {
    return finish('error', error instanceof Error ? error.message : 'Unable to save this TM Unifi invoice.');
  }
}
