import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { QuotationPanel } from '@/components/quotation-panel';
import { requireRole } from '@/lib/auth';
import { customerDirectory } from '@/lib/quotations/model';
import { loadQuotationRegistry } from '@/lib/quotations/registry';
import '../billing/billing.css';

async function Quotations() {
  try {
    const registry = await loadQuotationRegistry();
    return <QuotationPanel initialData={{ quotes: registry.quotes, customers: customerDirectory(registry) }}/>;
  } catch {
    return <QuotationPanel initialData={null}/>;
  }
}

export default async function Page() {
  const profile = await requireRole(['admin', 'management_viewer']);
  return <AppShell profile={profile} title="Quotations">
    <Suspense fallback={<div className="panel" role="status" aria-busy="true">Loading quotations…</div>}>
      <Quotations/>
    </Suspense>
  </AppShell>;
}
