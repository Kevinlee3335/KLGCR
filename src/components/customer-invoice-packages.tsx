'use client';

import {useEffect, useState, type FormEvent} from 'react';
import Link from 'next/link';
import type {CustomerInvoiceCatalog} from '@/lib/billing-customer-invoices';
import {MANUALLY_SENT_CUSTOMER_INVOICE_MESSAGE, MANUALLY_SENT_CUSTOMER_INVOICE_PERIOD} from '@/lib/billing-mail-settings';

const apiPath = '/api/billing-preview/customer-invoices';
const emptySelection = {value: '', page: '', invoiceNo: ''};
const labels = {rental: 'Rental', utility: 'Utilities'};
const statuses = {draft: 'Awaiting preview and confirmation', sending: 'Sending', delivery_pending: 'Delivery needs checking', sent: 'Sent'};
type Kind = keyof typeof labels;
type Selection = typeof emptySelection;
type Package = CustomerInvoiceCatalog['packages'][number];
const idFor = (account: CustomerInvoiceCatalog['accounts'][number]) => `${account.id}:${account.index}`;

async function readResponse(response: Response) {
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || 'Unable to process the package. Refresh the list before retrying.');
  return result;
}

function usePdfUrl(file: File | null) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
}

export function CustomerInvoicePackages({initialPeriod}: {initialPeriod: string}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [catalog, setCatalog] = useState<CustomerInvoiceCatalog>();
  const [reload, setReload] = useState(0);
  const [source, setSource] = useState<File | null>(null);
  const [utilitySource, setUtilitySource] = useState<File | null>(null);
  const [selection, setSelection] = useState({rental: emptySelection, utility: emptySelection});
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewId, setReviewId] = useState<string>();
  const [confirmed, setConfirmed] = useState(false);
  const sourceUrl = usePdfUrl(source);
  const utilityUrl = usePdfUrl(utilitySource);
  const manuallySent = period === MANUALLY_SENT_CUSTOMER_INVOICE_PERIOD;

  useEffect(() => {
    const controller = new AbortController();
    if (period) fetch(`${apiPath}?period=${encodeURIComponent(period)}`, {cache: 'no-store', signal: controller.signal})
      .then(readResponse).then(data => {if (!controller.signal.aborted) setCatalog(data);})
      .catch(error => {if (!controller.signal.aborted) setMessage(error.message);});
    return () => controller.abort();
  }, [period, reload]);

  const selectedAccounts = catalog?.accounts.filter(account => selection[account.kind].value === idFor(account)) || [];
  const registered = [...new Set(selectedAccounts.map(account => account.email).filter(Boolean))];
  const review = catalog?.packages.find(pack => pack.id === reviewId);
  const reviewedAccounts = catalog?.accounts.filter(account => review && (
    account.kind === 'rental' ? account.id === review.rental_run_id && account.index === review.rental_line_index
      : account.id === review.utility_run_id && account.index === review.utility_line_index
  )) || [];
  const pdfUrl = (id: string) => `${apiPath}?pdf=${encodeURIComponent(id)}`;

  function select(kind: Kind, patch: Partial<Selection>) {
    setSelection(current => ({...current, [kind]: {...current[kind], ...patch}}));
  }

  function openReview(id: string) {
    setReviewId(id);
    setConfirmed(false);
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source || busy || manuallySent) return;
    const mapping = (kind: Kind) => {
      const current = selection[kind];
      if (!current.value) return null;
      const [runId, lineIndex] = current.value.split(':');
      return {runId, lineIndex: Number(lineIndex), page: Number(current.page), invoiceNo: current.invoiceNo};
    };
    const form = new FormData();
    form.set('source', source);
    if (utilitySource && selection.utility.value) form.set('utilitySource', utilitySource);
    form.set('mapping', JSON.stringify({period, rental: mapping('rental'), utility: mapping('utility'), email: registered[0] || email}));
    setBusy(true);
    setMessage('');
    try {
      const pack = await readResponse(await fetch(apiPath, {method: 'POST', body: form}));
      setCatalog(current => current && ({...current, packages: [...current.packages, pack]}));
      setSelection({rental: emptySelection, utility: emptySelection});
      setEmail('');
      openReview(pack.id);
      setReload(value => value + 1);
      setMessage('Draft saved. Check the exact PDF and recipient before confirming delivery.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to prepare the PDF.');
      setReload(value => value + 1);
    } finally { setBusy(false); }
  }

  async function changePackage(pack: Package, action: 'send' | 'discard') {
    if (busy || (action === 'send' && pack.period === MANUALLY_SENT_CUSTOMER_INVOICE_PERIOD)) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await readResponse(await fetch(apiPath, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: pack.id, action}),
      }));
      if (action === 'discard') {
        setReviewId(undefined);
        setMessage('Draft discarded. Its invoice pages can now be reassigned.');
      } else {
        setMessage(result.status === 'sent' ? `Invoice package sent to ${result.recipient}.` : statuses[result.status as Package['status']]);
      }
      setReload(value => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update this package.');
      setReload(value => value + 1);
    } finally { setBusy(false); }
  }

  return <>
    <section className="panel">
      <h3>Customer invoice delivery</h3>
      <label>Billing month <input type="month" value={period} disabled={busy} onChange={event => {
        setCatalog(undefined);
        setPeriod(event.target.value);
        setSelection({rental: emptySelection, utility: emptySelection});
        setEmail('');
        setMessage('');
        setReviewId(undefined);
      }}/></label>
      {manuallySent ? <p role="status">{MANUALLY_SENT_CUSTOMER_INVOICE_MESSAGE} Continue in <Link href="/admin/payment-verification">Payment Verification</Link>.</p>
        : <p className="subtle">Upload the official PDF from Accounts. Choose the matching approved company invoices and their PDF page numbers. You can keep the same scan open for the next company.</p>}
      {!manuallySent && <form onSubmit={saveDraft}>
        <fieldset disabled={busy || !catalog?.accounts.length}>
          <label>Accounts PDF <input type="file" accept="application/pdf,.pdf" required onChange={event => setSource(event.target.files?.[0] || null)}/></label>
          {sourceUrl && <p><a href={sourceUrl} target="_blank" rel="noreferrer">Open Accounts PDF</a></p>}
          <label>Separate Accounts Utilities PDF, if supplied <input type="file" accept="application/pdf,.pdf" onChange={event => setUtilitySource(event.target.files?.[0] || null)}/></label>
          {utilityUrl && <p><a href={utilityUrl} target="_blank" rel="noreferrer">Open separate Utilities PDF</a></p>}
          {(['rental', 'utility'] as const).map(kind => {
            const current = selection[kind];
            const url = kind === 'utility' && utilityUrl ? utilityUrl : sourceUrl;
            return <div key={kind} className="form-grid">
              <label>{labels[kind]} invoice <select value={current.value} onChange={event => select(kind, {...emptySelection, value: event.target.value})}>
                <option value="">No {labels[kind]} invoice in this package</option>
                {catalog?.accounts.filter(account => account.kind === kind).map(account =>
                  <option key={idFor(account)} value={idFor(account)} disabled={account.packaged}>{account.name} · {account.billNo}{account.packaged ? ' · Already assigned' : ''}</option>)}
              </select></label>
              {current.value && <>
                <label>Accounts PDF page <input type="number" min="1" max="500" required value={current.page} onChange={event => select(kind, {page: event.target.value})}/></label>
                <label>Official Accounts invoice no. <input type="text" maxLength={70} placeholder="e.g. KH/2611-09" value={current.invoiceNo} onChange={event => select(kind, {invoiceNo: event.target.value})}/></label>
                {url && Number(current.page) > 0 && <p><a href={`${url}#page=${Number(current.page)}`} target="_blank" rel="noreferrer">Open source page {current.page}</a></p>}
              </>}
            </div>;
          })}
          {registered.length > 1 && <p role="alert">The selected accounts have different registered email addresses. Check the company selection.</p>}
          {selectedAccounts.length > 0 && registered.length <= 1 && <>
            <label>Company email <input type="email" maxLength={254} required readOnly={Boolean(registered[0])} value={registered[0] || email} onChange={event => setEmail(event.target.value)}/></label>
            {selectedAccounts.some(account => !account.email) && <p className="subtle">Confirming the package registers this email for the selected company accounts that do not have an address yet.</p>}
          </>}
          <button type="submit" disabled={!source || !selectedAccounts.length || registered.length > 1}>{busy ? 'Preparing…' : 'Prepare PDF draft'}</button>
        </fieldset>
      </form>}
      {!manuallySent && !catalog && period && <p className="subtle">Loading approved invoices…</p>}
      {!manuallySent && catalog && !catalog.accounts.length && <p className="subtle">No James-approved Rental or Utilities invoices are available for this month.</p>}
      {message && <p role="status">{message}</p>}
    </section>
    {review && <section className="panel">
      <h3>Review {review.company_name}</h3>
      <p>{review.period} · {review.page_count} PDF pages · <strong>{review.recipient}</strong></p>
      {reviewedAccounts.length > 0 && <ul>{reviewedAccounts.map(account => {
        const invoiceNo = account.kind === 'rental' ? review.rental_invoice_no : review.utility_invoice_no;
        return <li key={idFor(account)}>{labels[account.kind]} · {account.name} · {invoiceNo || account.billNo} · {account.amount.toLocaleString('en-MY', {style: 'currency', currency: 'MYR'})}</li>;
      })}</ul>}
      <p><a href={pdfUrl(review.id)} target="_blank" rel="noreferrer">Open exact PDF in a new tab</a></p>
      <iframe title={`Invoice package for ${review.company_name}`} src={pdfUrl(review.id)} width="100%" height="680"/>
      {review.status === 'draft' && <div>
        {!manuallySent && <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/> I checked the official invoice pages and amounts against the approved invoices, and verified the company and recipient.</label>}
        <p>{!manuallySent && <><button type="button" disabled={!confirmed || busy} onClick={() => void changePackage(review, 'send')}>Confirm and send from noreply</button>{' '}</>}
          <button type="button" disabled={busy} onClick={() => void changePackage(review, 'discard')}>Discard draft</button></p>
      </div>}
      {!manuallySent && review.status !== 'draft' && <p>{statuses[review.status]}{review.delivery_error ? ` · ${review.delivery_error}` : ''}</p>}
    </section>}
    <section className="panel">
      <h3>Package history · {period}</h3>
      {!catalog?.packages.length ? <p className="subtle">No invoice packages saved for this month.</p> : <div className="table-wrap"><table className="table">
        <thead><tr><th>Company</th><th>Recipient</th><th>Pages</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{catalog.packages.map(pack => <tr key={pack.id}>
          <td>{pack.company_name}</td><td>{pack.recipient}</td><td>{pack.page_count}</td>
          <td>{manuallySent && pack.status !== 'sent' ? 'Delivery closed' : statuses[pack.status]}{pack.sent_at && <small> · {new Date(pack.sent_at).toLocaleString('en-GB', {timeZone: 'Asia/Kuala_Lumpur'})} MYT</small>}</td>
          <td><button type="button" disabled={busy} onClick={() => openReview(pack.id)}>{pack.status === 'draft' ? 'Review draft' : 'View PDF'}</button>{' '}
            {!manuallySent && (pack.status === 'delivery_pending' || pack.status === 'sending') && <button type="button" disabled={busy} onClick={() => void changePackage(pack, 'send')}>Check / retry delivery</button>}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>;
}
