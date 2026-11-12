import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionProfile } from '@/lib/auth';
import { complianceDocumentBucket } from '@/lib/compliance-workflow';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: 'Sign in to open this PDF.' }, { status: 401 });
  if (!['admin', 'management_viewer'].includes(profile.role)) {
    return NextResponse.json({ error: 'This PDF is available to management only.' }, { status: 403 });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid document.' }, { status: 400 });
  const db = await createClient();
  const { data, error } = await db.from('compliance_cycle_documents').select('source,storage_path').eq('id', id).maybeSingle();
  if (error || !data?.storage_path) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  const bucket = data.source === 'supplier_email' ? 'supplier-mail' : complianceDocumentBucket;
  const signed = await db.storage.from(bucket).createSignedUrl(data.storage_path, 300);
  if (signed.error || !signed.data) return NextResponse.json({ error: 'Unable to open this PDF.' }, { status: 404 });
  const response = NextResponse.redirect(signed.data.signedUrl);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
