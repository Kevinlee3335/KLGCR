import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import {
  buildCompliancePrint,
  compliancePrintBucket,
  compliancePrintKinds,
  compliancePrintMaxBytes,
  compliancePrintMime,
  compliancePrintPath,
  compliancePrintRecordFields,
  inspectComplianceTemplate,
  isCompliancePrintKind,
  printRecords,
  type CompliancePrintMaster,
} from '@/lib/compliance-print';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const setupPath = '/admin/cert-servicing/print-template';

function setupResult(request: Request, key: 'saved' | 'error', message: string) {
  const url = new URL(setupPath, request.url);
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, 303);
}

export async function GET(request: Request) {
  const profile = await getSessionProfile();
  if (!profile || !['admin', 'management_viewer'].includes(profile.role)) {
    return new NextResponse('Access denied.', { status: 403 });
  }
  const kind = new URL(request.url).searchParams.get('kind');
  if (!isCompliancePrintKind(kind)) return new NextResponse('Choose a compliance print list.', { status: 400 });

  const db = await createClient();
  const [template, records] = await Promise.all([
    createAdminClient().storage.from(compliancePrintBucket).download(compliancePrintPath),
    db.from('compliance_records')
      .select(compliancePrintRecordFields)
      .eq('record_type', kind),
  ]);
  if (template.error || !template.data) {
    const message = 'Upload the original Excel workbook in Print template before printing.';
    return profile.role === 'admin'
      ? setupResult(request, 'error', message)
      : new NextResponse('Ask an Admin to upload the original Excel print template.', { status: 409 });
  }
  if (records.error) return new NextResponse('Could not load the compliance records for printing.', { status: 503 });

  try {
    const bytes = Buffer.from(await template.data.arrayBuffer());
    const output = buildCompliancePrint(bytes, kind, printRecords(kind, (records.data ?? []) as CompliancePrintMaster[]));
    return new NextResponse(new Uint8Array(output.bytes), {
      headers: {
        'Content-Type': compliancePrintMime,
        'Content-Disposition': `attachment; filename="${compliancePrintKinds[kind].filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-KLGCR-Unmapped-Print-Records': String(output.unmapped.length),
      },
    });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : 'Could not create the Excel print file.', { status: 409 });
  }
}

export async function POST(request: Request) {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') return new NextResponse('Access denied.', { status: 403 });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return new NextResponse('Access denied.', { status: 403 });

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('template');
  } catch {
    return setupResult(request, 'error', 'Choose an Excel .xlsx template to upload.');
  }
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx') || !file.size || file.size > compliancePrintMaxBytes) {
    return setupResult(request, 'error', 'Choose an Excel .xlsx template of 3 MB or less.');
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    inspectComplianceTemplate(bytes);
  } catch (error) {
    return setupResult(request, 'error', error instanceof Error ? error.message : 'The Excel print template could not be read.');
  }
  const { error } = await createAdminClient().storage.from(compliancePrintBucket).upload(compliancePrintPath, bytes, {
    contentType: compliancePrintMime,
    upsert: true,
  });
  if (error) return setupResult(request, 'error', 'Could not save the private Excel print template. Please try again.');
  return setupResult(request, 'saved', '1');
}
