'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardActionFollowUp } from './dashboard-action-follow-up';
import type { PaymentMailList } from '@/lib/payment-mail/types';
import styles from './monitoring-follow-up.module.css';

const money = new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' });
const receivedDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
});

export function PaymentMailFollowUp() {
  const [data, setData] = useState<PaymentMailList | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let stopped = false;
    let running = false;
    let controller: AbortController | null = null;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    async function refresh() {
      if (stopped || running || document.visibilityState === 'hidden') return;
      running = true;
      controller = new AbortController();
      deadline = setTimeout(() => controller?.abort(), 15_000);
      try {
        const response = await fetch('/api/payment-mail?status=pending&limit=10', {
          cache: 'no-store', signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.items) || typeof result.total !== 'number') {
          throw new Error('Unable to load payment emails');
        }
        if (!stopped) { setData(result); setError(false); }
      } catch {
        if (!stopped) setError(true);
      } finally { if (deadline) clearTimeout(deadline); running = false; }
    }
    void refresh();
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stopped = true;
      controller?.abort();
      if (deadline) clearTimeout(deadline);
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return <>
    {error && <section className={styles.panel} aria-label="Payment verification connection">
      <p className={styles.empty} role="alert">Payment reminders could not refresh. <Link href="/admin/payment-verification">Open payment verification</Link></p>
    </section>}
    {data && data.total > 0 && <DashboardActionFollowUp
      title="Payment Verification"
      subtitle="Rental & Utilities payment emails awaiting bank verification. Previous days remain until handled."
      count={data.total}
      nameColumn="Company"
      detailColumn="Suggested amount"
      metaColumn="Received · MYT"
      href="/admin/payment-verification"
      action="Verify"
      items={data.items.slice(0, 10).map(item => ({
        id: item.id,
        name: item.suggested_company_name || 'Company needs matching',
        detail: `${item.suggested_amount == null ? 'Amount needs checking' : `Suggested ${money.format(Number(item.suggested_amount))}`}${item.status === 'needs_review' ? ' · Needs review' : ''}`,
        meta: receivedDate.format(new Date(item.received_at)),
        href: `/admin/payment-verification?id=${encodeURIComponent(item.id)}`,
      }))}
    />}
  </>;
}
