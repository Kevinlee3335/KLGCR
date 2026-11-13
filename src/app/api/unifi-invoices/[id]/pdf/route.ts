import { getSessionProfile } from '@/lib/auth';
import { downloadUnifiInvoice } from '@/lib/unifi-invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') return new Response('Forbidden', { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return new Response('Not found', { status: 404 });
  try {
    const document = await downloadUnifiInvoice(id);
    if (!document) return new Response('Not found', { status: 404 });
    const name = document.fileName.replace(/[^a-z0-9._-]/gi, '-');
    return new Response(new Uint8Array(document.bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${name}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "frame-ancestors 'self'",
      },
    });
  } catch {
    return new Response('Unable to read this invoice PDF.', { status: 503 });
  }
}
