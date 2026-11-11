'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, FileText } from 'lucide-react';
import { receiptListPageSize, type ReceiptListResult } from '@/lib/payment-mail/types';
import styles from './payment-mail.module.css';

const money = new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' });

export function PaymentReceiptList({ refreshVersion }: { refreshVersion: number }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ReceiptListResult | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), q: query });

    async function load() {
      try {
        const response = await fetch(`/api/payment-mail/receipts?${params}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) throw new Error(data?.error || 'Unable to load receipts. Please try again.');
        if (!controller.signal.aborted) {
          setResult(data as ReceiptListResult);
          setError('');
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load receipts. Please try again.');
      }
    }

    void load();
    return () => controller.abort();
  }, [page, query, retry, refreshVersion]);

  function changePage(next: number) {
    setResult(null);
    setError('');
    setPage(next);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = search.trim();
    if (next === query && page === 1) return;
    setQuery(next);
    changePage(1);
  }

  return <section className={styles.card} aria-labelledby="payment-receipt-list-title">
    <header className={styles.cardHead}>
      <h2 id="payment-receipt-list-title">Receipt List{result && <span className={styles.count}>{result.total}</span>}</h2>
    </header>
    <form className={styles.toolbar} role="search" aria-label="Search receipts" onSubmit={submitSearch}>
      <div className={styles.actions}>
        <input className={styles.search} type="search" aria-label="Receipt number or customer" placeholder="Search receipt no. or customer…" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} />
        <button type="submit" className={styles.button}>Search</button>
      </div>
    </form>
    {error ? <div className={styles.cardBody}>
      <p className={`${styles.notice} ${styles.error}`} role="alert"><AlertCircle size={17} aria-hidden="true" />{error}</p>
      <button type="button" className={styles.button} onClick={() => { setError(''); setRetry(value => value + 1); }}>Try again</button>
    </div> : !result ? <p className={styles.loading} role="status">Loading receipts…</p> : result.items.length ? <div className={styles.tableWrap}>
      <table className={`${styles.table} ${styles.receiptTable}`} role="table">
        <thead role="rowgroup"><tr role="row">
          <th scope="col" role="columnheader">Receipt no.</th>
          <th scope="col" role="columnheader">Customer</th>
          <th scope="col" role="columnheader">Verified by</th>
          <th scope="col" role="columnheader">Amount</th>
          <th scope="col" role="columnheader">Payment for</th>
          <th scope="col" role="columnheader">Receipt</th>
        </tr></thead>
        <tbody role="rowgroup">{result.items.map(receipt => <tr key={receipt.id} role="row">
          <td role="cell" data-label="Receipt no."><strong>{receipt.receipt_no}</strong><small>{receipt.paid_on}</small></td>
          <td role="cell" data-label="Customer"><strong>{receipt.payer}</strong></td>
          <td role="cell" data-label="Verified by">{receipt.verifier_name || 'Not recorded'}</td>
          <td role="cell" data-label="Amount" className={styles.number}><strong>{money.format(Number(receipt.amount))}</strong></td>
          <td role="cell" data-label="Payment for" className={styles.receiptPurpose}>{receipt.description}</td>
          <td role="cell"><a className={styles.button} href={`/api/finance?receipt=${encodeURIComponent(receipt.id)}`} target="_blank" rel="noopener noreferrer" aria-label={`View Receipt ${receipt.receipt_no}`}><FileText size={15} aria-hidden="true" />View Receipt</a></td>
        </tr>)}</tbody>
      </table>
    </div> : <div className={styles.empty}><FileText size={28} aria-hidden="true" />{query ? 'No receipts match this search.' : 'No receipts have been issued yet.'}</div>}
    {result && result.total > receiptListPageSize && <footer className={styles.footer}>
      <span>{(page - 1) * receiptListPageSize + 1}–{(page - 1) * receiptListPageSize + result.items.length} of {result.total} receipts</span>
      <div className={styles.actions}>
        <button type="button" className={styles.button} disabled={page === 1} onClick={() => changePage(page - 1)}>Previous</button>
        <button type="button" className={styles.button} disabled={page * receiptListPageSize >= result.total} onClick={() => changePage(page + 1)}>Next</button>
      </div>
    </footer>}
  </section>;
}
