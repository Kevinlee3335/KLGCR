'use client';

import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import Link from 'next/link';
import {AlertCircle, Banknote, Download, FileText, Mail, RefreshCw} from 'lucide-react';
import {SignaturePad} from './signature-pad';
import './gym-deposit-panel.css';

type EmailStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'not_required';
type DocumentState = {
  id: string;
  payer: string;
  email: string;
  member_reference: string;
  amount: number | string;
  created_at: string;
  pdf_ready: boolean;
  pdf_error: string | null;
  email_status: EmailStatus;
  email_error: string | null;
  emailed_at: string | null;
};

export type GymDepositReceipt = DocumentState & {
  receipt_no: string;
  source_module: string;
  member_id: string;
  received_on: string;
  received_by_name: string;
  origin: 'received' | 'existing';
  original_receipt_no: string | null;
  note: string | null;
  status: 'held' | 'refunded';
  voucher_id?: string | null;
  voucher_no?: string | null;
};

export type GymPaymentVoucher = DocumentState & {
  voucher_no: string;
  deposit_receipt_id: string;
  paid_on: string;
  refunded_by_name: string;
  original_receipt_no: string;
};

export type GymDepositSummary = {
  receivedAmount: number;
  openingAmount: number;
  refundedAmount: number;
  heldAmount: number;
  heldCount: number;
};

export type GymDepositListResponse = {
  receipts: GymDepositReceipt[];
  vouchers: GymPaymentVoucher[];
  receiptCount: number;
  voucherCount: number;
  signatureReady: boolean;
  actorName: string;
  canManage: boolean;
  summary: GymDepositSummary;
  memberHasHeldDeposit?: boolean;
};

export type GymDepositPanelProps = {
  member?: {id: string; name: string; memberType: string};
  initialKind?: 'receipts' | 'vouchers';
  readOnly?: boolean;
};

type Kind = 'receipts' | 'vouchers';
type DocumentKind = 'receipt' | 'voucher';
type Origin = 'received' | 'existing';
type Filters = {q: string; from: string; to: string; status: string};
const pageSize = 25;
const cash = (value: number | string) => `RM ${Number(value).toFixed(2)}`;
const malaysiaDay = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const dateLabel = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || '—';
  return new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}).format(new Date(`${value}T00:00:00Z`));
};
const pdfHref = (kind: DocumentKind, id: string, download = false) => `/api/gym-deposits/${kind}/${encodeURIComponent(id)}/pdf${download ? '?download=1' : ''}`;
const emailLabels: Record<EmailStatus, string> = {pending: 'Email queued', sending: 'Email sending', sent: 'Email sent', failed: 'Email failed', not_required: 'Email not required'};

export function GymDepositPanel({member, initialKind = 'receipts', readOnly = false}: GymDepositPanelProps) {
  const headingId = useId(), panelId = useId();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [data, setData] = useState<GymDepositListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({q: '', from: '', to: '', status: ''});
  const [pending, setPending] = useState<string | null>(null);
  const [formOrigin, setFormOrigin] = useState<Origin | null>(null);
  const receiveRequestId = useRef('');
  const refundRequestIds = useRef(new Map<string, string>());
  const today = malaysiaDay();

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({kind, page: String(page)});
    if (member?.id) params.set('member', member.id);
    for (const [key, value] of Object.entries(filters)) if (value && (key !== 'status' || kind === 'receipts')) params.set(key, value);
    setLoading(true);
    setLoadError('');
    async function load() {
      try {
        const response = await fetch(`/api/gym-deposits?${params}`, {cache: 'no-store', signal: controller.signal});
        const result = await response.json().catch(() => null);
        if (!response.ok || !result || !Array.isArray(result.receipts) || !Array.isArray(result.vouchers)) throw new Error(result?.error || 'Unable to load deposit records. Please try again.');
        if (!controller.signal.aborted) setData(result as GymDepositListResponse);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Unable to load deposit records. Please try again.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [kind, page, filters, refresh, member?.id]);

  useEffect(() => {
    receiveRequestId.current = '';
    setFormOrigin(null);
    setNotice('');
    setActionError('');
    setPage(1);
  }, [member?.id]);

  const canManage = Boolean(data?.canManage) && !readOnly;
  const memberHasHeld = data?.memberHasHeldDeposit ?? data?.receipts.some(receipt => receipt.status === 'held') ?? false;
  const count = kind === 'receipts' ? data?.receiptCount || 0 : data?.voucherCount || 0;
  const busy = pending !== null || loading;

  async function post(key: string, payload: Record<string, unknown>) {
    if (pending || loading || !canManage) return false;
    setPending(key);
    setActionError('');
    setNotice('');
    try {
      const response = await fetch('/api/gym-deposits', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        if (response.status === 409) setRefresh(value => value + 1);
        throw new Error(result?.error || 'Unable to save. Refresh the record before trying again.');
      }
      const number = result.document?.number || result.receipt_no || result.voucher_no || 'Record';
      setNotice(result.already_refunded
        ? `This deposit was already refunded by ${result.refunded_by_name || 'the recorded employee'}. Original PV: ${result.voucher_no || number}. No new refund was recorded.`
        : result.message || `${number} saved. Check its PDF and email status below.`);
      setRefresh(value => value + 1);
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to save. Please try again.');
      return false;
    } finally {
      setPending(null);
    }
  }

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member || !formOrigin || memberHasHeld) return;
    const form = new FormData(event.currentTarget);
    if (!receiveRequestId.current) receiveRequestId.current = crypto.randomUUID();
    const saved = await post('receive', {
      action: 'receive', request_id: receiveRequestId.current, member_id: member.id,
      received_on: String(form.get('received_on') || ''), origin: formOrigin,
      original_receipt_no: String(form.get('original_receipt_no') || ''), note: String(form.get('note') || ''),
    });
    if (saved) {
      receiveRequestId.current = '';
      setFormOrigin(null);
      setKind('receipts');
      setPage(1);
    }
  }

  async function refund(receipt: GymDepositReceipt) {
    if (!data?.signatureReady || receipt.status !== 'held') return;
    if (!refundRequestIds.current.has(receipt.id)) refundRequestIds.current.set(receipt.id, crypto.randomUUID());
    const saved = await post(`refund:${receipt.id}`, {action: 'refund', request_id: refundRequestIds.current.get(receipt.id), deposit_id: receipt.id});
    if (saved) refundRequestIds.current.delete(receipt.id);
  }

  function changeKind(next: Kind) {
    setKind(next);
    setPage(1);
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFilters({q: String(form.get('q') || '').trim(), from: String(form.get('from') || ''), to: String(form.get('to') || ''), status: String(form.get('status') || '')});
    setPage(1);
  }

  function documents(record: DocumentState, documentKind: DocumentKind, number: string) {
    return <div className="gym-deposit-document-actions">
      {record.pdf_ready ? <>
        <a className="button secondary" href={pdfHref(documentKind, record.id)} target="_blank" rel="noopener noreferrer" aria-label={`View ${documentKind === 'receipt' ? 'receipt' : 'PV'} ${number}`}><FileText size={14} aria-hidden="true"/>View {documentKind === 'receipt' ? 'Receipt' : 'PV'}</a>
        <a className="gym-deposit-download" href={pdfHref(documentKind, record.id, true)} aria-label={`Download ${number}`}><Download size={15} aria-hidden="true"/>Download</a>
      </> : <>
        <span className={`gym-deposit-file-state${record.pdf_error ? ' gym-deposit-error-text' : ''}`}>{record.pdf_error ? 'PDF needs retry' : 'PDF pending'}</span>
        {canManage && <button type="button" className="button secondary" disabled={busy} onClick={() => void post(`pdf:${record.id}`, {action: 'retry_pdf', document_kind: documentKind, id: record.id})}><RefreshCw size={13} aria-hidden="true"/>{pending === `pdf:${record.id}` ? 'Retrying…' : 'Retry PDF'}</button>}
      </>}
      <span className={`gym-deposit-email gym-deposit-email-${record.email_status}`}><Mail size={12} aria-hidden="true"/>{emailLabels[record.email_status] || 'Email queued'}</span>
      {(record.email_error || record.pdf_error) && <small className="gym-deposit-error-text">{record.pdf_error || record.email_error}</small>}
      {canManage && record.pdf_ready && (record.email_status === 'failed' || record.email_status === 'pending') && <button type="button" className="gym-deposit-text-button" disabled={busy} onClick={() => void post(`email:${record.id}`, {action: 'resend', document_kind: documentKind, id: record.id})}>{pending === `email:${record.id}` ? 'Sending…' : 'Retry email'}</button>}
    </div>;
  }

  return <section className={`gym-deposit-panel${member ? ' gym-deposit-panel-member' : ''}`} aria-labelledby={headingId}>
    <header className="gym-deposit-heading">
      <div><p className="eyebrow">CASH DEPOSITS</p><h2 id={headingId}>{member ? 'Gym deposit' : 'Deposit receipts & payment vouchers'}</h2><p className="subtle">{member ? 'RM10 refundable cash deposit · Separate from membership fees' : 'Gym deposits and refunds · Shared KLGDR / KLGPV numbering'}</p></div>
      <button type="button" className="button secondary gym-deposit-refresh" disabled={busy} onClick={() => setRefresh(value => value + 1)} aria-label="Refresh deposit records"><RefreshCw size={15} aria-hidden="true"/>Refresh</button>
    </header>

    {!member && data && <div className="gym-deposit-summary" aria-label="Deposit balances">
      <div><span>Cash deposits received</span><strong>{cash(data.summary.receivedAmount)}</strong></div>
      <div><span>Existing deposits recorded</span><strong>{cash(data.summary.openingAmount)}</strong></div>
      <div><span>Cash refunded</span><strong>{cash(data.summary.refundedAmount)}</strong></div>
      <div className="gym-deposit-balance"><span>Deposits held · {data.summary.heldCount}</span><strong>{cash(data.summary.heldAmount)}</strong></div>
    </div>}

    {notice && <p className="gym-deposit-notice" role="status">{notice}</p>}
    {actionError && <p className="gym-deposit-notice gym-deposit-error" role="alert"><AlertCircle size={16} aria-hidden="true"/>{actionError}</p>}

    {canManage && data && !data.signatureReady && !loadError && <div className="gym-deposit-signature-setup"><SignaturePad/><div className="gym-deposit-signature-check"><p>Save your own signature before recording a cash refund.</p><button type="button" className="button secondary" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Check saved signature</button></div></div>}

    {member && canManage && !loadError && <div className="gym-deposit-member-tools">
      {memberHasHeld ? <p className="gym-deposit-held-note"><Banknote size={17} aria-hidden="true"/><strong>Deposit Already Held</strong> · Use the existing receipt below.</p> : <div className="gym-deposit-buttons">
        {member.memberType === 'outsider' && <button type="button" className="button" disabled={busy} onClick={() => {setFormOrigin('received'); setActionError('');}} aria-expanded={formOrigin === 'received'}>Receive RM10 cash deposit</button>}
        <button type="button" className="button secondary" disabled={busy} onClick={() => {setFormOrigin('existing'); setActionError('');}} aria-expanded={formOrigin === 'existing'}>Record existing deposit</button>
        {member.memberType !== 'outsider' && <p className="subtle">New RM10 gym deposits apply to Non Residence members. An existing deposit can be recorded with its original receipt.</p>}
      </div>}
      {formOrigin && !memberHasHeld && <form className="gym-deposit-receive-form" onSubmit={receive}>
        <div className="gym-deposit-form-heading"><h3>{formOrigin === 'received' ? 'Receive cash deposit' : 'Record an existing deposit'}</h3><p>{formOrigin === 'received' ? `Record only after ${data?.actorName || 'the logged-in employee'} has received RM10 cash from ${member.name}.` : 'Opening balance only. Keep the original receipt number and collection date. This does not record new cash or automatically email a new receipt.'}</p></div>
        <label>Member<input value={member.name} readOnly/></label>
        <label>{formOrigin === 'received' ? 'Collection date' : 'Original collection date'}<input type="date" name="received_on" defaultValue={today} min={formOrigin === 'received' ? `${today.slice(0, 4)}-01-01` : '2000-01-01'} max={today} required disabled={busy}/></label>
        <label>Deposit amount<input value="RM 10.00 · Cash" readOnly/></label>
        {formOrigin === 'existing' && <label>Original Deposit Receipt No.<input name="original_receipt_no" maxLength={100} required disabled={busy} placeholder="Number on the original receipt"/></label>}
        <label className="gym-deposit-note-field">Note (optional)<input name="note" maxLength={1000} disabled={busy}/></label>
        <div className="gym-deposit-form-actions"><button type="submit" className="button" disabled={busy}>{pending === 'receive' ? 'Saving…' : formOrigin === 'received' ? 'Record cash & issue receipt' : 'Save existing deposit'}</button><button type="button" className="button secondary" disabled={busy} onClick={() => {setFormOrigin(null); receiveRequestId.current = '';}}>Cancel</button></div>
      </form>}
    </div>}

    {!member && canManage && <p className="gym-deposit-choose-member">To receive or record a deposit, <Link href="/admin/members">choose a member in Membership</Link>.</p>}

    <div className="gym-deposit-tabs" role="tablist" aria-label="Deposit document lists">
      <button type="button" role="tab" id={`${panelId}-receipts-tab`} aria-controls={`${panelId}-records`} aria-selected={kind === 'receipts'} disabled={pending !== null} onClick={() => changeKind('receipts')}>Deposit Receipts{data && <span>{data.receiptCount}</span>}</button>
      <button type="button" role="tab" id={`${panelId}-vouchers-tab`} aria-controls={`${panelId}-records`} aria-selected={kind === 'vouchers'} disabled={pending !== null} onClick={() => changeKind('vouchers')}>Payment Vouchers{data && <span>{data.voucherCount}</span>}</button>
    </div>

    {!member && <form className="gym-deposit-filters" onSubmit={search} role="search" aria-label="Search deposit documents">
      <label className="gym-deposit-search-field">Name, member or document number<input type="search" name="q" defaultValue={filters.q} maxLength={100} placeholder="Search name, reference or number"/></label>
      <label>From<input name="from" type="date" defaultValue={filters.from}/></label>
      <label>To<input name="to" type="date" defaultValue={filters.to}/></label>
      {kind === 'receipts' && <label>Deposit status<select name="status" defaultValue={filters.status}><option value="">All deposits</option><option value="held">Deposit held</option><option value="refunded">Refunded</option></select></label>}
      <button type="submit" className="button secondary" disabled={pending !== null}>Search</button>
    </form>}

    {loadError ? <div className="gym-deposit-load-error"><p className="gym-deposit-notice gym-deposit-error" role="alert"><AlertCircle size={16} aria-hidden="true"/>{loadError}</p><button type="button" className="button secondary" onClick={() => setRefresh(value => value + 1)}>Try again</button></div> : <div id={`${panelId}-records`} role="tabpanel" aria-labelledby={`${panelId}-${kind}-tab`} aria-busy={loading}>
      {loading ? <p className="gym-deposit-loading" role="status">Loading deposit records…</p> : data && <>
        {canManage && kind === 'receipts' && data.receipts.some(receipt => receipt.status === 'held') && <div className="gym-deposit-refund-notice"><p>Record a refund only after returning RM10 cash. <strong>Refunded by: {data.actorName || 'the logged-in employee'}</strong>. The staff signature and K HOTEL company seal appear on the PV; the member does not sign.</p>{!data.signatureReady && <p className="gym-deposit-error-text">Save your signature above, then select Check saved signature before recording a refund.</p>}</div>}
        {kind === 'receipts' ? data.receipts.length ? <div className="gym-deposit-table-wrap"><table className="table gym-deposit-table"><thead><tr><th scope="col">Receipt / Date</th><th scope="col">Member</th><th scope="col">Received by</th><th scope="col">Amount / Status</th><th scope="col">Documents / Actions</th></tr></thead><tbody>{data.receipts.map(receipt => {
          const voucher = data.vouchers.find(row => row.deposit_receipt_id === receipt.id);
          const voucherId = receipt.voucher_id || voucher?.id;
          const voucherNumber = receipt.voucher_no || voucher?.voucher_no;
          return <tr key={receipt.id}>
            <td data-label="Receipt / Date"><strong>{receipt.receipt_no}</strong><small>{dateLabel(receipt.received_on)}</small>{receipt.origin === 'existing' && <span className="gym-deposit-opening">Existing deposit</span>}{receipt.note && <small>{receipt.note}</small>}</td>
            <td data-label="Member"><strong>{!member && canManage ? <Link href={`/admin/members?id=${encodeURIComponent(receipt.member_id)}`}>{receipt.payer}</Link> : receipt.payer}</strong><small>{receipt.member_reference || 'No member reference'}</small><small>{receipt.email || 'Email not recorded'}</small></td>
            <td data-label="Received by">{receipt.received_by_name}</td>
            <td data-label="Amount / Status"><strong>{cash(receipt.amount)}</strong><span className={`gym-deposit-status gym-deposit-status-${receipt.status}`}>{receipt.status === 'held' ? 'Deposit held' : 'Refunded'}</span></td>
            <td data-label="Documents / Actions">{documents(receipt, 'receipt', receipt.receipt_no)}{canManage && receipt.status === 'held' && <button type="button" className="button gym-deposit-refund-button" disabled={busy || !data.signatureReady} onClick={() => void refund(receipt)} aria-label={`Record RM10 refund for ${receipt.payer}`}>{pending === `refund:${receipt.id}` ? 'Recording…' : 'Record RM10 refund'}</button>}{voucherId && voucherNumber && <a className="gym-deposit-related" href={pdfHref('voucher', voucherId)} target="_blank" rel="noopener noreferrer">PV: {voucherNumber}</a>}</td>
          </tr>;
        })}</tbody></table></div> : <div className="gym-deposit-empty"><FileText size={25} aria-hidden="true"/><p>{member ? 'No deposit is recorded for this member.' : filters.q || filters.from || filters.to || filters.status ? 'No deposit receipts match these filters.' : 'No deposit receipts have been recorded yet.'}</p></div> : data.vouchers.length ? <div className="gym-deposit-table-wrap"><table className="table gym-deposit-table"><thead><tr><th scope="col">PV / Date</th><th scope="col">Paid to</th><th scope="col">Original deposit receipt</th><th scope="col">Refunded by / Amount</th><th scope="col">Documents / Email</th></tr></thead><tbody>{data.vouchers.map(voucher => <tr key={voucher.id}>
          <td data-label="PV / Date"><strong>{voucher.voucher_no}</strong><small>{dateLabel(voucher.paid_on)}</small><span className="gym-deposit-status gym-deposit-status-refunded">Refunded</span></td>
          <td data-label="Paid to"><strong>{voucher.payer}</strong><small>{voucher.member_reference || 'No member reference'}</small><small>{voucher.email || 'Email not recorded'}</small></td>
          <td data-label="Original deposit receipt"><a href={pdfHref('receipt', voucher.deposit_receipt_id)} target="_blank" rel="noopener noreferrer">{voucher.original_receipt_no}</a></td>
          <td data-label="Refunded by / Amount"><strong>{voucher.refunded_by_name}</strong><small>{cash(voucher.amount)} · Cash</small></td>
          <td data-label="Documents / Email">{documents(voucher, 'voucher', voucher.voucher_no)}</td>
        </tr>)}</tbody></table></div> : <div className="gym-deposit-empty"><FileText size={25} aria-hidden="true"/><p>{filters.q || filters.from || filters.to ? 'No payment vouchers match these filters.' : 'No deposit refunds have been recorded yet.'}</p></div>}
      </>}
    </div>}

    {data && !loading && !loadError && count > pageSize && <footer className="gym-deposit-pagination"><span>Page {page} · {count} {kind === 'receipts' ? 'receipts' : 'payment vouchers'}</span><div className="gym-deposit-buttons"><button type="button" className="button secondary" disabled={busy || page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><button type="button" className="button secondary" disabled={busy || page * pageSize >= count} onClick={() => setPage(value => value + 1)}>Next</button></div></footer>}
  </section>;
}
