import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionProfile } from '@/lib/auth';
import { depositDocumentFilename, ensureDepositDocumentPdf, loadDepositDocument } from '@/lib/deposit-documents';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const profile = await getSessionProfile();
  if (!profile || !['admin', 'management_viewer'].includes(profile.role)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  const parsed = z.object({ kind: z.enum(['receipt', 'voucher']), id: z.string().uuid() }).safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  try {
    const { kind, id } = parsed.data;
    const document = await loadDepositDocument(kind, id);
    if (document.source_module !== 'gym') return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    const pdf = await ensureDepositDocumentPdf(kind, document);
    const attachment = request.nextUrl.searchParams.get('download') === '1';
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store',
      'Content-Disposition': `${attachment ? 'attachment' : 'inline'}; filename="${depositDocumentFilename(kind, document)}"`, 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to open the PDF. The cash record is saved.' }, { status: 503 });
  }
}
