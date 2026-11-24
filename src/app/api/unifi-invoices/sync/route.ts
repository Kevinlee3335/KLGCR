import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { unifiInvoicePath } from '@/lib/unifi-invoices';
import { syncUnifiWebmail } from '@/lib/unifi-webmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(request: Request) {
  const profile = await getSessionProfile();
  const url = new URL(unifiInvoicePath, request.url);
  if (profile?.role !== 'admin' || !profile.is_super_admin || profile.username !== 'kevinlee3335'
      || request.headers.get('origin') !== url.origin) return new Response('Forbidden', { status: 403 });
  try {
    const result = await syncUnifiWebmail();
    url.searchParams.set('receipts', String(result.receiptImported));
    if (result.status === 'not_connected') url.searchParams.set('error', 'Connect Webmail before checking for invoices.');
    else if (result.receiptErrors || result.receiptRemaining) url.searchParams.set('error', 'Receipt sync needs attention or has more emails to process. See Webmail connection details and run Sync now again.');
    else if (result.needsReview) url.searchParams.set('error', `Webmail checked: ${result.imported} invoice(s) imported; ${result.needsReview} attachment(s) failed. See the Webmail connection details below.`);
    else url.searchParams.set('synced', String(result.imported));
  } catch {
    url.searchParams.set('error', 'Unable to check TM Unifi Webmail. Check the connection and try again.');
  }
  return NextResponse.redirect(url, 303);
}
