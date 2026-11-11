'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowUpRight, CheckCircle2, FileText, Inbox, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import type { OfficialReceipt } from '@/lib/official-receipt';
import type { PaymentMailDetail, PaymentMailItem, PaymentMailList } from '@/lib/payment-mail/types';
import { PaymentMailConnection } from './payment-mail-connection';
import { PaymentReceiptList } from './payment-receipt-list';
import styles from './payment-mail.module.css';

const money = new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' });
const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const filters = [['pending', 'Pending verification'], ['verified', 'Verified'], ['rejected', 'Rejected'], ['duplicate', 'Duplicates'], ['all', 'All emails']] as const;
type MailFilter = typeof filters[number][0];
type Invoice = PaymentMailDetail['invoiceOptions'][number];
type ActionResponse = { ok: boolean; item?: PaymentMailItem; receipt?: OfficialReceipt; mail?: 'sent' | 'pending'; error?: string };

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to complete the request. Please try again.');
  return data as T;
}

function statusInfo(status: string) {
  switch (status) {
    case 'pending_verification': return { label: 'Pending verification', tone: 'pending' };
    case 'needs_review': return { label: 'Needs review', tone: 'warning' };
    case 'verified': return { label: 'Verified', tone: 'success' };
    case 'rejected': return { label: 'Rejected', tone: 'danger' };
    case 'duplicate': return { label: 'Duplicate', tone: 'muted' };
    default: return { label: status.replaceAll('_', ' '), tone: 'muted' };
  }
}

function Status({ status }: { status: string }) {
  const info = statusInfo(status);
  return <span className={styles.status} data-tone={info.tone}>{info.label}</span>;
}

function cents(value: string): number | null {
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function invoiceKey(invoice: Invoice) { return `${invoice.run_id}:${invoice.line_index}`; }
function localToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()); }
function received(value: string) { return dateTime.format(new Date(value)); }
function pending(item: Pick<PaymentMailItem, 'status'>) { return ['pending_verification', 'needs_review'].includes(item.status); }
function attachmentSize(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`; }

export function PaymentMailVerification({ initialId }: { initialId?: string }) {
  const [view, setView] = useState<'inbox' | 'receipts'>('inbox');
  const [filter, setFilter] = useState<MailFilter>('pending');
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<PaymentMailList | null>(null);
  const [selectedId, setSelectedId] = useState(initialId || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const reviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSelectedId(initialId || ''); }, [initialId]);

  useEffect(() => {
    if (!selectedId) return;
    const review = reviewRef.current;
    review?.focus({ preventScroll: true });
    review?.scrollIntoView?.({ block: 'start' });
  }, [selectedId]);

  useEffect(() => {
    if (view !== 'inbox') return;
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
        const result = await request<PaymentMailList>(`/api/payment-mail?status=${filter}&limit=50&offset=${page * 50}`, { signal: controller.signal });
        if (!stopped) { setData(result); setError(''); setLastRefreshed(new Date().toISOString()); }
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : 'Unable to load payment emails.');
      } finally { if (deadline) clearTimeout(deadline); running = false; if (!stopped) setLoading(false); }
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
  }, [filter, page, refreshVersion, view]);

  function select(id: string) {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('id', id);
    window.history.replaceState(window.history.state, '', url);
  }

  function changeFilter(next: MailFilter) {
    setFilter(next); setPage(0); setData(null); setLoading(true); setQuery('');
  }

  const search = query.trim().toLowerCase();
  const shown = data?.items.filter(item => !search || [item.subject, item.sender_email, item.suggested_company_name, item.suggested_reference].some(value => value?.toLowerCase().includes(search))) || [];

  return <div className={styles.workspace}>
    <div className={styles.intro}>
      <div><span className={styles.eyebrow}>RENTAL & UTILITIES</span><h2>Payment emails & bank verification</h2><p>Review each payment proof, confirm the money received in the bank, then allocate it to the correct invoices and issue the official Receipt.</p></div>
      <Link className={styles.button} href="/admin/billing"><ArrowLeft size={15} aria-hidden="true" />Rental & Utilities</Link>
    </div>
    <PaymentMailConnection />
    <div className={styles.tabs} role="group" aria-label="Payment records">
      <button type="button" className={styles.tab} aria-pressed={view === 'inbox'} onClick={() => setView('inbox')}>Payment inbox</button>
      <button type="button" className={styles.tab} aria-pressed={view === 'receipts'} onClick={() => setView('receipts')}>Receipt List</button>
    </div>
    {view === 'receipts' && <PaymentReceiptList refreshVersion={refreshVersion} />}
    <section hidden={view !== 'inbox'} className={styles.card} aria-labelledby="payment-inbox-title">
      <header className={styles.cardHead}>
        <div><h2 id="payment-inbox-title">Payment inbox{data && <span className={styles.count}>{data.total}</span>}</h2><p>Pending emails stay here until verified or rejected, including those received on previous days.</p></div>
        <button type="button" className={styles.button} disabled={loading} onClick={() => { setLoading(true); setRefreshVersion(value => value + 1); }}><RefreshCw size={15} aria-hidden="true" />{loading ? 'Refreshing…' : 'Refresh'}</button>
      </header>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="group" aria-label="Payment email status">{filters.map(([value, label]) => <button key={value} type="button" className={styles.tab} aria-pressed={filter === value} onClick={() => changeFilter(value)}>{label}</button>)}</div>
        <input className={styles.search} type="search" aria-label="Search shown emails" placeholder="Search shown emails…" value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      {error && <div className={styles.cardBody}><p className={`${styles.notice} ${styles.error}`} role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{error}</span></p></div>}
      {loading && !data ? <p className={styles.loading}>Loading payment emails…</p> : shown.length > 0 ? <div className={styles.tableWrap} role="region" aria-label="Payment emails" tabIndex={0}>
        <table className={`${styles.table} ${styles.inboxTable}`}>
          <thead><tr><th scope="col">Company / email</th><th scope="col">Suggested amount</th><th scope="col">Received · MYT</th><th scope="col">Status</th><th scope="col">Review</th></tr></thead>
          <tbody>{shown.map(item => <tr key={item.id} data-selected={selectedId === item.id}>
            <td><strong>{item.suggested_company_name || 'Company needs matching'}</strong><small>{item.subject || '(No subject)'}</small><small>{item.sender_email}</small></td>
            <td className={styles.number}><strong>{item.suggested_amount == null ? 'Not identified' : money.format(Number(item.suggested_amount))}</strong><small>Check against bank receipt</small></td>
            <td>{received(item.received_at)}</td>
            <td><Status status={item.status} />{item.review_reasons.length > 0 && pending(item) && <small>{item.review_reasons.length} point{item.review_reasons.length === 1 ? '' : 's'} to review</small>}</td>
            <td><button type="button" className={styles.button} onClick={() => select(item.id)} aria-label={`${pending(item) ? 'Verify' : 'View'} ${item.suggested_company_name || item.subject || 'payment email'}`}>{pending(item) ? 'Verify' : 'View'}<ArrowUpRight size={14} aria-hidden="true" /></button></td>
          </tr>)}</tbody>
        </table>
      </div> : !error && <div className={styles.empty}><Inbox size={28} aria-hidden="true" />{search ? 'No matching emails on this page.' : filter === 'pending' ? 'No payments awaiting verification.' : 'No emails in this view.'}</div>}
      <footer className={styles.footer}>
        <span>{data ? `${data.total === 0 ? 0 : page * 50 + 1}–${Math.min(page * 50 + data.items.length, data.total)} of ${data.total} emails` : 'Payment email history'}{lastRefreshed ? ` · Last checked ${received(lastRefreshed)} MYT` : ''}</span>
        <div className={styles.actions}><button type="button" className={styles.button} disabled={loading || page === 0} onClick={() => { setPage(value => value - 1); setData(null); setLoading(true); }}>Previous</button><button type="button" className={styles.button} disabled={loading || !data || (page + 1) * 50 >= data.total} onClick={() => { setPage(value => value + 1); setData(null); setLoading(true); }}>Next</button></div>
      </footer>
    </section>
    {selectedId && <div hidden={view !== 'inbox'} className={styles.review} ref={reviewRef} tabIndex={-1} role="region" aria-label="Selected payment email"><PaymentReview key={selectedId} id={selectedId} onChanged={() => setRefreshVersion(value => value + 1)} onOpen={select} /></div>}
  </div>;
}

function PaymentReview({ id, onChanged, onOpen }: { id: string; onChanged: () => void; onOpen: (id: string) => void }) {
  const [detail, setDetail] = useState<PaymentMailDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [companyKey, setCompanyKey] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState('');
  const [reference, setReference] = useState('');
  const [proofId, setProofId] = useState('');
  const [bankReceived, setBankReceived] = useState(false);
  const [companyConfirmed, setCompanyConfirmed] = useState(false);
  const [busy, setBusy] = useState<'verify' | 'reject' | 'resend' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const invoiceRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    setLoadError('');
    request<PaymentMailDetail>(`/api/payment-mail?id=${encodeURIComponent(id)}`, { signal: controller.signal }).then(result => {
      if (stopped) return;
      setDetail(result);
      const key = result.companies.some(company => company.key === result.item.suggested_company_key) ? result.item.suggested_company_key || '' : '';
      setCompanyKey(key);
      setInvoices(key ? result.invoiceOptions : []);
      setAllocations({}); setBankReceived(false); setCompanyConfirmed(false); setAmount('');
      setPaidOn(result.item.suggested_paid_on || localToday());
      setReference(result.item.suggested_reference || '');
      setProofId(result.item.attachments.find(attachment => attachment.status === 'ready')?.id || '');
    }).catch(cause => { if (!stopped) setLoadError(cause instanceof Error ? cause.message : 'Unable to load this email.'); });
    return () => { stopped = true; controller.abort(); invoiceRequest.current?.abort(); };
  }, [id, reload]);

  function resetConfirmations() { setBankReceived(false); setCompanyConfirmed(false); setError(''); }

  async function chooseCompany(key: string) {
    invoiceRequest.current?.abort();
    setCompanyKey(key); setInvoices([]); setAllocations({}); resetConfirmations();
    if (!key) { setInvoiceLoading(false); return; }
    const controller = new AbortController();
    invoiceRequest.current = controller;
    setInvoiceLoading(true);
    try {
      const result = await request<PaymentMailDetail>(`/api/payment-mail?id=${encodeURIComponent(id)}&company=${encodeURIComponent(key)}`, { signal: controller.signal });
      if (!controller.signal.aborted) { setInvoices(result.invoiceOptions); setDetail(previous => previous ? { ...previous, companies: result.companies } : result); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load company invoices.');
    } finally { if (!controller.signal.aborted) setInvoiceLoading(false); }
  }

  if (loadError) return <section className={styles.card}><div className={styles.cardBody}><p className={`${styles.notice} ${styles.error}`} role="alert"><AlertCircle size={18} aria-hidden="true" /><span>{loadError}</span></p><button type="button" className={styles.button} onClick={() => setReload(value => value + 1)}>Try again</button></div></section>;
  if (!detail) return <section className={styles.card}><p className={styles.loading}>Opening the original email and payment proof…</p></section>;

  const { item, receipt } = detail;
  const isPending = pending(item);
  const isDuplicate = item.status === 'duplicate' || Boolean(item.duplicate_of);
  const company = detail.companies.find(candidate => candidate.key === companyKey);
  const proof = item.attachments.find(attachment => attachment.id === proofId && attachment.status === 'ready');
  const proofUrl = proof ? `/api/payment-mail?id=${encodeURIComponent(id)}&proof=${encodeURIComponent(proof.id)}` : '';
  const selected = invoices.filter(invoice => allocations[invoiceKey(invoice)] !== undefined);
  const selectedNames = [...new Set(selected.map(invoice => invoice.account_name))];
  const amountCents = cents(amount);
  const allocatedCents = selected.reduce((sum, invoice) => sum + (cents(allocations[invoiceKey(invoice)]) || 0), 0);
  const badAllocation = selected.find(invoice => {
    const value = cents(allocations[invoiceKey(invoice)]);
    return value == null || value <= 0 || value > Math.round(Number(invoice.balance) * 100) || !invoice.approved_at;
  });
  const remaining = amountCents == null ? null : amountCents - allocatedCents;
  const requirements = [
    !company ? 'Select the registered company contact.' : '',
    !proof ? 'Select a saved payment proof.' : '',
    amountCents == null || amountCents <= 0 ? 'Enter the actual amount received in the bank.' : '',
    !paidOn || paidOn > localToday() ? 'Confirm a valid payment date.' : '',
    !selected.length ? 'Select the invoices covered by this payment.' : '',
    badAllocation ? `Check the allocation for ${badAllocation.bill_no}; it must be within the unpaid balance.` : '',
    selected.length > 0 && amountCents != null && remaining !== 0 ? 'The invoice allocations must equal the amount received.' : '',
    !bankReceived ? 'Confirm that the money has reached the bank account.' : '',
    !companyConfirmed ? 'Confirm the selected company names and invoices match this payment.' : '',
  ].filter(Boolean);
  const canVerify = isPending && !isDuplicate && !busy && !invoiceLoading && requirements.length === 0;

  function toggleInvoice(invoice: Invoice, checked: boolean) {
    resetConfirmations();
    setAllocations(previous => {
      const next = { ...previous };
      const key = invoiceKey(invoice);
      if (!checked) delete next[key];
      else {
        const alreadyAllocated = Object.values(previous).reduce((sum, value) => sum + (cents(value) || 0), 0);
        const available = amountCents == null ? 0 : amountCents - alreadyAllocated;
        const balance = Math.round(Number(invoice.balance) * 100);
        next[key] = (Math.min(balance, available > 0 ? available : balance) / 100).toFixed(2);
      }
      return next;
    });
  }

  async function act(action: 'verify' | 'reject' | 'resend') {
    if (busy || (action === 'verify' && !canVerify)) return;
    setBusy(action); setError(''); setMessage('');
    const body = action === 'verify' ? {
      action, id, companyKey, paidOn, bankReference: reference.trim(), amount: (amountCents || 0) / 100,
      bankReceived, companyConfirmed, proofId,
      allocations: selected.map(invoice => ({ run_id: invoice.run_id, line_index: invoice.line_index, amount: (cents(allocations[invoiceKey(invoice)]) || 0) / 100 })),
    } : action === 'reject' ? { action, id, reason: rejectReason.trim() } : { action, id };
    try {
      const result = await request<ActionResponse>('/api/payment-mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!result.ok) throw new Error(result.error || 'The action was not completed.');
      setDetail(previous => previous ? {
        ...previous,
        item: result.item || { ...previous.item, ...(action === 'reject' ? { status: 'rejected' as const, rejection_reason: rejectReason.trim() } : {}) },
        receipt: result.receipt || previous.receipt,
      } : previous);
      if (action === 'verify') setMessage(result.mail === 'sent' ? `Payment verified. Receipt ${result.receipt?.receipt_no || ''} emailed to the registered contact.` : `Payment verified. Receipt ${result.receipt?.receipt_no || ''} created; its email is pending. Use “Send / check email” below.`);
      if (action === 'reject') setMessage('Email rejected. The reason has been saved.');
      if (action === 'resend') setMessage(result.mail === 'pending' ? 'Receipt email is still pending. Check the status below before trying again.' : 'Receipt email status checked.');
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete this action.');
    } finally { setBusy(null); }
  }

  return <div className={styles.spaced}>
    <header className={styles.reviewHeader}><div className={styles.reviewHeading}><h2>Review payment</h2><Status status={item.status} /></div><span className={styles.subtle}>Received {received(item.received_at)} MYT</span></header>
    {message && <p className={`${styles.notice} ${styles.success}`} role="status"><CheckCircle2 size={18} aria-hidden="true" /><span>{message}</span></p>}
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert"><AlertCircle size={18} aria-hidden="true" /><span>{error}</span></p>}
    {item.review_reasons.length > 0 && <div className={styles.notice}><AlertCircle size={18} aria-hidden="true" /><div><strong>Review before verifying</strong><ul>{item.review_reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul></div></div>}
    {isDuplicate && <div className={styles.notice}><AlertCircle size={18} aria-hidden="true" /><div><strong>Duplicate payment proof</strong><p>This email cannot create another Receipt. Review the existing record before handling this copy.</p>{item.duplicate_of && <button type="button" className={styles.button} onClick={() => onOpen(item.duplicate_of!)}>View original payment<ArrowUpRight size={14} aria-hidden="true" /></button>}</div></div>}
    {item.status === 'rejected' && <p className={`${styles.notice} ${styles.error}`}><AlertCircle size={18} aria-hidden="true" /><span><strong>Rejected:</strong> {item.rejection_reason || 'No reason recorded.'}</span></p>}
    <div className={styles.reviewGrid}>
      <div className={styles.column}>
        <section className={styles.card} aria-labelledby="payment-source-title">
          <header className={styles.cardHead}><h3 id="payment-source-title">Original email</h3><Mail size={17} aria-hidden="true" /></header>
          <div className={styles.cardBody}><dl className={styles.metadata}><div><dt>From</dt><dd>{item.sender_email}</dd></div><div><dt>Subject</dt><dd>{item.subject || '(No subject)'}</dd></div><div><dt>Received</dt><dd>{received(item.received_at)} MYT</dd></div></dl><div className={styles.emailBody}>{item.body_text || 'No readable email body was supplied. Review the attachments below.'}</div></div>
        </section>
        <section className={styles.card} aria-labelledby="payment-proof-title">
          <header className={styles.cardHead}><div><h3 id="payment-proof-title">Payment proof</h3><p>Choose the attachment that supports this bank payment.</p></div><FileText size={17} aria-hidden="true" /></header>
          <div className={styles.cardBody}>
            {item.attachments.length ? <div className={styles.attachments} role="group" aria-label="Payment proof attachments">{item.attachments.map(attachment => <label key={attachment.id} className={styles.attachment} aria-disabled={attachment.status !== 'ready'}>
              <input type="radio" name={`proof-${id}`} value={attachment.id} checked={proofId === attachment.id} disabled={Boolean(busy) || attachment.status !== 'ready'} onChange={() => { setProofId(attachment.id); resetConfirmations(); }} />
              <span><strong>{attachment.filename}</strong><small>{attachmentSize(attachment.size_bytes)} · {attachment.mime_type}{attachment.status !== 'ready' ? ` · ${attachment.status.replaceAll('_', ' ')}` : ''}</small></span>
            </label>)}</div> : <p className={styles.subtle}>No payment proof attachment is available. Verification requires a saved proof.</p>}
            {proof && <div className={styles.preview}>
              {proof.mime_type === 'application/pdf' ? <iframe src={proofUrl} title={`Payment proof: ${proof.filename}`} /> : proof.mime_type.startsWith('image/') ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={proofUrl} alt={`Payment proof ${proof.filename}`} /> : <p className={styles.empty}>Open this attachment to review it.</p>}
              <div className={styles.previewLink}><span>{proof.mime_type === 'application/pdf' ? 'PDF payment proof' : 'Payment proof preview'}</span><a className={styles.link} href={proofUrl} target="_blank" rel="noopener noreferrer">Open original<ArrowUpRight size={14} aria-hidden="true" /></a></div>
            </div>}
          </div>
        </section>
      </div>
      <div className={styles.column}>
        {receipt && <section className={styles.card} aria-labelledby="verified-receipt-title"><div className={styles.cardBody}>
          <div className={styles.receipt}><CheckCircle2 size={25} aria-hidden="true" /><div><span className={styles.eyebrow}>OFFICIAL RECEIPT</span><h3 id="verified-receipt-title">{receipt.receipt_no}</h3><p>{receipt.payer}</p><p>{receipt.description}</p></div></div>
          <div className={styles.verifiedAmounts}><span>Amount<strong>{money.format(Number(receipt.amount))}</strong></span><span>Payment date<strong>{receipt.paid_on}</strong></span></div>
          <p className={styles.subtle}>Registered recipient: <strong>{receipt.email}</strong>{item.verified_at ? <><br />Verified {received(item.verified_at)} MYT</> : null}</p>
          <p className={`${styles.notice} ${receipt.emailed_at ? styles.success : ''}`}><Mail size={17} aria-hidden="true" /><span>{receipt.emailed_at ? `Receipt emailed ${received(receipt.emailed_at)} MYT.` : 'Payment verified. Receipt email is pending.'}{receipt.email_error && <><br />{receipt.email_error}</>}</span></p>
          <div className={styles.actions}><a className={styles.button} href={`/api/finance?receipt=${encodeURIComponent(receipt.id)}`} target="_blank" rel="noopener noreferrer"><FileText size={15} aria-hidden="true" />View Receipt PDF</a><button type="button" className={styles.button} disabled={Boolean(busy)} onClick={() => act('resend')}><Mail size={15} aria-hidden="true" />{busy === 'resend' ? 'Checking email…' : 'Send / check email'}</button></div>
        </div></section>}
        {isPending && !isDuplicate && <form className={styles.card} onSubmit={event => { event.preventDefault(); void act('verify'); }} aria-labelledby="bank-verification-title">
          <header className={styles.cardHead}><div><h3 id="bank-verification-title">Confirm bank payment & invoices</h3><p>Email details are suggestions. Confirm the actual bank receipt before issuing a Receipt.</p></div><ShieldCheck size={20} aria-hidden="true" /></header>
          <div className={styles.cardBody}>
            <div className={styles.suggestions}><span>Suggested amount<strong>{item.suggested_amount == null ? 'Not identified' : money.format(Number(item.suggested_amount))}</strong></span><span>Suggested date<strong>{item.suggested_paid_on || 'Not identified'}</strong></span><span>Suggested reference<strong>{item.suggested_reference || 'Not identified'}</strong></span>{item.suggested_invoice_numbers.length > 0 && <span>Invoice numbers found<strong>{item.suggested_invoice_numbers.join(', ')}</strong></span>}</div>
            <label className={styles.field}><span>Company / registered receipt contact</span><select className={styles.select} value={companyKey} disabled={Boolean(busy)} required onChange={event => void chooseCompany(event.target.value)}><option value="">Select company contact</option>{detail.companies.map(candidate => <option key={candidate.key} value={candidate.key}>{candidate.name} · {candidate.email}</option>)}</select><small>Choose the contact saved for the company. The incoming sender does not change the receipt email.</small></label>
            {company ? <p className={styles.companyNote}>Receipt will be emailed to <strong>{company.email}</strong>.<br />Registered accounts: {company.accounts.map(account => `${account.account_name} (${account.kind === 'rental' ? 'Rental' : 'Utilities'})`).join(' · ')}</p> : <p className={styles.companyNote}>If the correct company contact is missing, update its saved email in <Link href="/admin/billing">Rental & Utilities</Link> before verifying.</p>}
            <div className={styles.formGrid}>
              <label className={styles.field}><span>Actual amount received (RM)</span><input className={styles.input} type="number" inputMode="decimal" min="0.01" max="1000000000" step="0.01" value={amount} disabled={Boolean(busy)} required placeholder="Enter bank amount" onChange={event => { setAmount(event.target.value); resetConfirmations(); }} /></label>
              <label className={styles.field}><span>Payment date</span><input className={styles.input} type="date" max={localToday()} value={paidOn} disabled={Boolean(busy)} required onChange={event => { setPaidOn(event.target.value); resetConfirmations(); }} /></label>
              <label className={`${styles.field} ${styles.wide}`}><span>Bank reference</span><input className={styles.input} value={reference} maxLength={200} disabled={Boolean(busy)} onChange={event => { setReference(event.target.value); resetConfirmations(); }} placeholder="Confirm or enter the bank transaction reference" /></label>
            </div>
          </div>
          <div className={styles.invoiceHead}><div><h3>Unpaid invoices</h3><p>Select Rental and Utilities across the months covered. Adjust the allocation for a partial payment.</p></div>{selected.length > 0 && <span className={styles.subtle}>{selected.length} selected</span>}</div>
          {invoiceLoading ? <p className={styles.loading}>Loading unpaid invoices…</p> : invoices.length ? <div className={styles.tableWrap} role="region" aria-label="Unpaid invoice allocations" tabIndex={0}><table className={`${styles.table} ${styles.invoiceTable}`}><thead><tr><th scope="col"><span className={styles.hidden}>Pay invoice</span></th><th scope="col">Company / invoice</th><th scope="col">Unpaid balance</th><th scope="col">Allocate (RM)</th></tr></thead><tbody>{invoices.map(invoice => {
            const key = invoiceKey(invoice);
            const checked = allocations[key] !== undefined;
            const eligible = Boolean(invoice.approved_at) && Number(invoice.balance) > 0;
            const pdfUrl = invoice.customer_package_id
              ? `/api/billing-preview/customer-invoices?pdf=${encodeURIComponent(invoice.customer_package_id)}`
              : `/api/billing-documents/${encodeURIComponent(invoice.run_id)}/${invoice.line_index}`;
            return <tr key={key}><td><input type="checkbox" checked={checked} disabled={Boolean(busy) || !eligible} onChange={event => toggleInvoice(invoice, event.target.checked)} aria-label={`Select ${invoice.account_name} ${invoice.kind === 'rental' ? 'Rental' : 'Utilities'} ${invoice.period} ${invoice.bill_no}`} /></td><td><strong>{invoice.account_name}</strong><small>{invoice.kind === 'rental' ? 'Rental' : 'Utilities'} · {invoice.period}</small><a className={styles.link} href={pdfUrl} target="_blank" rel="noopener noreferrer">{invoice.bill_no}<ArrowUpRight size={12} aria-hidden="true" /></a>{!invoice.approved_at && <small>Awaiting approval</small>}</td><td className={styles.number}><span className={styles.balance}>{money.format(Number(invoice.balance))}</span><small>Billed {money.format(Number(invoice.amount))}</small>{Number(invoice.paid) > 0 && <small>Paid {money.format(Number(invoice.paid))}</small>}</td><td>{checked ? <input className={styles.input} type="number" min="0.01" max={Number(invoice.balance)} step="0.01" inputMode="decimal" required aria-label={`Allocation for ${invoice.bill_no}`} value={allocations[key]} disabled={Boolean(busy)} onChange={event => { setAllocations(previous => ({ ...previous, [key]: event.target.value })); resetConfirmations(); }} /> : <span className={styles.subtle}>—</span>}</td></tr>;
          })}</tbody></table></div> : <p className={styles.empty}>{companyKey ? 'No unpaid invoices are available for this registered contact.' : 'Select a company contact to load its invoices.'}</p>}
          <div className={styles.allocationSummary}><span>Bank received<strong>{amountCents == null ? 'Not entered' : money.format(amountCents / 100)}</strong></span><span>Allocated<strong>{money.format(allocatedCents / 100)}</strong></span><span data-error={remaining !== null && remaining !== 0}>Difference<strong>{remaining == null ? '—' : money.format(remaining / 100)}</strong></span></div>
          <div className={styles.cardBody}>
            <div className={styles.confirmations}>
              <label className={styles.confirmation}><input type="checkbox" checked={bankReceived} disabled={Boolean(busy) || amountCents == null || amountCents <= 0 || !paidOn} onChange={event => setBankReceived(event.target.checked)} /><span>I checked the bank account and confirm that <strong>{amountCents == null ? 'the entered amount' : money.format(amountCents / 100)}</strong> was received on <strong>{paidOn || 'the selected date'}</strong>.</span></label>
              <label className={styles.confirmation}><input type="checkbox" checked={companyConfirmed} disabled={Boolean(busy) || !company || !selected.length} onChange={event => setCompanyConfirmed(event.target.checked)} /><span>I confirm this payment covers the selected invoices for <strong>{selectedNames.length ? selectedNames.join(' / ') : 'the selected company'}</strong>, and the Receipt should go to <strong>{company?.email || 'the registered contact'}</strong>.</span></label>
            </div>
            {requirements.length > 0 && <ul className={styles.requirements} aria-label="Verification requirements">{requirements.map(requirement => <li key={requirement}>{requirement}</li>)}</ul>}
            <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={!canVerify}><ShieldCheck size={17} aria-hidden="true" />{busy === 'verify' ? 'Verifying payment…' : 'Verify & Email Receipt'}</button>
          </div>
        </form>}
        {(isPending || item.status === 'duplicate') && <section className={styles.card}><div className={styles.cardBody}><details className={styles.reject}><summary>Reject this email</summary><p className={styles.subtle}>Save the reason this email should not be processed as a payment.</p><label className={styles.field}><span>Reason for rejection</span><textarea className={styles.textarea} rows={3} maxLength={500} value={rejectReason} disabled={Boolean(busy)} placeholder="Explain why this email is being rejected" onChange={event => setRejectReason(event.target.value)} /></label><button type="button" className={`${styles.button} ${styles.danger}`} disabled={Boolean(busy) || rejectReason.trim().length < 3} onClick={() => act('reject')}>{busy === 'reject' ? 'Saving rejection…' : 'Reject email'}</button></details></div></section>}
      </div>
    </div>
  </div>;
}
