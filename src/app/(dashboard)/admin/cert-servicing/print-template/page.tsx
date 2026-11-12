import { ArrowLeft, ChevronDown, FileSpreadsheet, Upload } from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import controls from '@/components/compliance-controls.module.css';
import { requireRole } from '@/lib/auth';
import {
  compliancePrintBucket, compliancePrintKinds, compliancePrintMime, compliancePrintPath,
  compliancePrintRecordFields, inspectCompliancePrintCoverage, type CompliancePrintCoverage, type CompliancePrintMaster,
} from '@/lib/compliance-print';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import styles from './print-template.module.css';

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

  return <AppShell profile={profile} title="Cert & Servicing">
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={`${controls.button} ${controls.quiet}`} href="/admin/cert-servicing">
          <ArrowLeft className={controls.icon} aria-hidden="true" /> Back to Cert &amp; Servicing
        </Link>
        <h2>Compliance print template</h2>
      </header>
      {query.error && <p className="error" role="alert">{query.error}</p>}
      {query.saved && <p className="success" role="status">Print template saved.</p>}
      <section className={`panel ${styles.panel}`} aria-labelledby="print-workbook">
        <div className={styles.workbook}>
          <span className={styles.workbookIcon}><FileSpreadsheet size={22} aria-hidden="true" /></span>
          <div>
            <h3 id="print-workbook">Excel workbook</h3>
            <p>{current.error ? 'Could not check the current template.' : hasTemplate ? 'The Excel template is ready.' : 'Upload the original renewal and servicing workbook.'}</p>
          </div>
        </div>
        <form className={styles.uploadForm} method="post" action="/api/cert-servicing/print" encType="multipart/form-data">
          <div className={styles.fileField}>
            <label className={controls.label} htmlFor="compliance-template">Original Excel workbook</label>
            <input className={controls.file} id="compliance-template" name="template" type="file" accept={`.xlsx,${compliancePrintMime}`} required />
          </div>
          <button type="submit" className={`${controls.button} ${controls.primary}`}>
            <Upload className={controls.icon} aria-hidden="true" /> {hasTemplate ? 'Replace print template' : 'Upload print template'}
          </button>
        </form>
        <p className={styles.printNote}>Open the downloaded list in Excel and choose <strong>Print Active Sheets</strong> to keep the original page setup, print area and layout.</p>
      </section>
      {hasTemplate && <section className={`panel ${styles.panel}`} aria-labelledby="print-row-links">
        <div>
          <h3 id="print-row-links">Print row links</h3>
          <p className={styles.printNote}>The export updates records linked to a template row. Update the template and link a row when adding an item that has no matching row.</p>
        </div>
        {coverageError && <p className="error" role="alert">{coverageError}</p>}
        {coverage.map(({ kind, sheetName, unmapped, error }) =>
          error ? <p key={kind} className="error" role="alert">{compliancePrintKinds[kind].label} · {error}</p>
            : unmapped.length > 0 ? <details className={styles.coverageDetails} key={kind}>
              <summary>
                <span>{compliancePrintKinds[kind].label} · {unmapped.length} records without a matching print row</span>
                <ChevronDown className={controls.icon} aria-hidden="true" />
              </summary>
              <ul>{unmapped.map((title) => <li key={title}>{title}</li>)}</ul>
            </details>
              : sheetName ? <p key={kind} className={styles.coverageMatch}>{sheetName} · all records matched</p> : null
        )}
      </section>}
    </div>
  </AppShell>;
}
