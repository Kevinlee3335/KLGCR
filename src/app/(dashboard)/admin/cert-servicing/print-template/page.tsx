import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth';
import {
  compliancePrintBucket, compliancePrintKinds, compliancePrintMime, compliancePrintPath,
  compliancePrintRecordFields, inspectCompliancePrintCoverage, type CompliancePrintCoverage, type CompliancePrintMaster,
} from '@/lib/compliance-print';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export default async function CompliancePrintTemplatePage({ searchParams }: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const profile = await requireRole(['admin']);
  const storage = createAdminClient().storage.from(compliancePrintBucket);
  const [query, current] = await Promise.all([
    searchParams,
    storage.list('', { search: compliancePrintPath, limit: 1 }),
  ]);
  const hasTemplate = current.data?.some((item) => item.name === compliancePrintPath);
  let coverage: CompliancePrintCoverage[] = [];
  let coverageError: string | null = null;
  if (hasTemplate) {
    const db = await createClient();
    const [template, records] = await Promise.all([
      storage.download(compliancePrintPath),
      db.from('compliance_records').select(`record_type,${compliancePrintRecordFields}` as const),
    ]);
    try {
      if (!template.data || template.error || records.error) throw new Error('Could not check the template row links.');
      coverage = inspectCompliancePrintCoverage(Buffer.from(await template.data.arrayBuffer()),
        (records.data ?? []) as (CompliancePrintMaster & { record_type: string })[]);
    } catch (error) {
      coverageError = error instanceof Error ? error.message : 'Could not check the template row links.';
    }
  }

  return <AppShell profile={profile} title="Compliance print template">
    <div className="section-head">
      <div><h2>Compliance print template</h2></div>
      <Link className="button" href="/admin/cert-servicing">Back to Cert &amp; Servicing</Link>
    </div>
    {query.error && <p className="error" role="alert">{query.error}</p>}
    {query.saved && <p className="success" role="status">Print template saved.</p>}
    <section className="panel">
      <p>{current.error ? 'Could not check the current template.' : hasTemplate ? 'The Excel template is ready.' : 'Upload the original renewal and servicing workbook.'}</p>
      <p>Open the downloaded list in Excel and choose Print Active Sheets. It retains the original page setup, print area and layout.</p>
      <p>The export updates records linked to a template row. Update the template and link a row when adding an item that has no matching row.</p>
      {coverageError && <p className="error" role="alert">{coverageError}</p>}
      {coverage.map(({ kind, sheetName, unmapped, error }) =>
        error ? <p key={kind} className="error" role="alert">{compliancePrintKinds[kind].label} · {error}</p>
          : unmapped.length > 0 ? <details key={kind}>
            <summary>{compliancePrintKinds[kind].label} · {unmapped.length} records without a matching print row</summary>
            <ul>{unmapped.map((title) => <li key={title}>{title}</li>)}</ul>
          </details>
            : sheetName ? <p key={kind} className="subtle">{sheetName} · all records matched</p> : null
      )}
      <form method="post" action="/api/cert-servicing/print" encType="multipart/form-data">
        <label htmlFor="compliance-template">Original Excel workbook</label>
        <input id="compliance-template" name="template" type="file" accept={`.xlsx,${compliancePrintMime}`} required />
        <button type="submit" className="button">{hasTemplate ? 'Replace print template' : 'Upload print template'}</button>
      </form>
    </section>
  </AppShell>;
}
