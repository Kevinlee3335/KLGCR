import {ArrowLeft} from 'lucide-react';
import styles from '@/components/customer-invoice-packages.module.css';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {AppShell} from '@/components/app-shell';
import {CustomerInvoicePackages} from '@/components/customer-invoice-packages';
import {requireRole} from '@/lib/auth';
import {billingPreviewEnabled, malaysiaClock} from '@/lib/billing-preview';

export default async function Page() {
  if (!billingPreviewEnabled()) notFound();
  const profile = await requireRole(['admin']);
  return <AppShell profile={profile} title="Customer invoice packages">
    <div className="section-head">
      <div><h2>Customer invoice packages</h2><p className="subtle">Prepare one PDF per company from Accounts invoices and the approved Utilities meter photos.</p></div>
      <Link className={styles.action} href="/admin/billing"><ArrowLeft size={16} aria-hidden="true"/> Back to Rental &amp; Utilities</Link>
    </div>
    <CustomerInvoicePackages initialPeriod={malaysiaClock().date.slice(0, 7)}/>
  </AppShell>;
}
