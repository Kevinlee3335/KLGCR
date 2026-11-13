import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { unifiInvoicePath } from '@/lib/unifi-invoices';
import { saveUnifiWebmailPassword } from '@/lib/unifi-webmail-connection';
import { verifyUnifiWebmailPassword } from '@/lib/unifi-webmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const profile = await getSessionProfile();
  const url = new URL(unifiInvoicePath, request.url);
  if (profile?.role !== 'admin' || !profile.is_super_admin || profile.username !== 'kevinlee3335'
      || request.headers.get('origin') !== url.origin) return new Response('Forbidden', { status: 403 });
  const form = await request.formData().catch(() => null);
  const password = form?.get('password');
  if (typeof password !== 'string' || !password.length || password.length > 1024) {
    url.searchParams.set('error', 'Enter the password for the project Webmail account.');
  } else {
    try {
      await verifyUnifiWebmailPassword(password);
      await saveUnifiWebmailPassword(password, profile.id);
      url.searchParams.set('connected', '1');
    } catch {
      url.searchParams.set('error', 'Could not connect to Webmail. Check the password and try again.');
    }
  }
  return NextResponse.redirect(url, 303);
}
