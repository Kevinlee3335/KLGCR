'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, Download, Mail, RefreshCw } from 'lucide-react';
import styles from './payment-mail.module.css';

type Connection = {
  id: string;
  created_at: string;
  enabled_from: string;
  last_checked_at: string | null;
  last_received_at: string | null;
  last_error: string | null;
  revoked_at?: string | null;
};
type ConnectionState = {
  mailbox: string;
  connections: Connection[];
  ready: boolean;
  status: 'connected' | 'not_connected' | 'stale';
  senders: { email: string; accounts: { kind: string; account_key: string; name?: string }[] }[];
  scriptUrl: string;
  manifestUrl: string;
};
type SetupKey = { token: string; id: string; origin: string; enabledFrom: string; mailbox: string };
const dateTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const api = '/api/payment-mail/connection';

async function getConnection(signal?: AbortSignal): Promise<ConnectionState> {
  const response = await fetch(api, { cache: 'no-store', signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to check the payment email connection.');
  return result;
}

export function PaymentMailConnection() {
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [setup, setSetup] = useState<SetupKey | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [lookback, setLookback] = useState('0');
  const [busy, setBusy] = useState<'create' | 'revoke' | 'refresh' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revokeId, setRevokeId] = useState('');

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
        const result = await getConnection(controller.signal);
        if (!stopped) { setConnection(result); setError(''); }
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : 'Unable to check the email connection.');
      } finally { if (deadline) clearTimeout(deadline); running = false; }
    }
    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { stopped = true; controller?.abort(); if (deadline) clearTimeout(deadline); window.clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);

  async function refresh() {
    setBusy('refresh'); setError('');
    try { setConnection(await getConnection()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to check the email connection.'); }
    finally { setBusy(null); }
  }

  async function mutate(action: 'create' | 'revoke', id?: string) {
    if (busy) return;
    setBusy(action); setError(''); setMessage('');
    try {
      const response = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'create' ? { action, lookbackDays: Number(lookback) } : { action, id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to update the payment email connection.');
      if (action === 'create') {
        setSetup(result); setShowKey(false);
        setMessage('Setup key created. Complete the installation below; the inbox is connected only after a successful mailbox check.');
      } else {
        if (setup?.id === id) setSetup(null);
        setRevokeId('');
        setMessage('Connection key revoked. This installation can no longer import payment emails.');
      }
      try { setConnection(await getConnection()); }
      catch { setError('The change was saved, but the latest connection status could not be loaded. Refresh to check it.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update the connection.'); }
    finally { setBusy(null); }
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setMessage(`${label} copied.`); }
    catch { setError(`Unable to copy ${label.toLowerCase()}. Select the field and copy it manually.`); }
  }

  const connected = connection?.ready && connection.status === 'connected';
  const status = connected ? 'Connected' : connection?.status === 'stale' ? 'Check connection' : connection ? 'Not connected' : error ? 'Status unavailable' : 'Checking…';

  return <details className={styles.connection}>
    <summary><Mail size={16} aria-hidden="true" /><span>Email connection</span><span className={styles.status} data-tone={connected ? 'success' : connection?.status === 'stale' ? 'warning' : 'muted'}>{status}</span></summary>
    <div className={styles.connectionBody}>
      <p>Mailbox: <strong>{connection?.mailbox || 'klgresidenceenquiry@gmail.com'}</strong>. The Dashboard refreshes incoming payment reminders while it is open.</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{error}</span></p>}
      {message && <p className={`${styles.notice} ${styles.success}`} role="status"><CheckCircle2 size={17} aria-hidden="true" /><span>{message}</span></p>}
      <div className={styles.actions}><button type="button" className={styles.button} disabled={Boolean(busy)} onClick={() => void refresh()}><RefreshCw size={14} aria-hidden="true" />{busy === 'refresh' ? 'Checking…' : 'Check connection'}</button>{connection && <><a className={styles.button} href={connection.scriptUrl} download><Download size={14} aria-hidden="true" />Download importer</a><a className={styles.button} href={connection.manifestUrl} download><Download size={14} aria-hidden="true" />Download manifest</a></>}</div>
      {connection?.connections.map(item => <div className={styles.connectionRow} key={item.id}>
        <div><strong>{item.revoked_at ? 'Revoked connection' : item.last_checked_at ? 'Mailbox installation' : 'Waiting for installation'}</strong><small>Created {dateTime.format(new Date(item.created_at))} MYT<br />Import from {dateTime.format(new Date(item.enabled_from))} MYT<br />Last successful check: {item.last_checked_at ? `${dateTime.format(new Date(item.last_checked_at))} MYT` : 'Not received'}<br />Last payment email: {item.last_received_at ? `${dateTime.format(new Date(item.last_received_at))} MYT` : 'None received yet'}</small>{item.last_error && <small className={styles.error}>{item.last_error}</small>}</div>
        {!item.revoked_at && <button type="button" className={`${styles.button} ${styles.danger}`} disabled={Boolean(busy)} onClick={() => setRevokeId(item.id)}>Revoke key</button>}
      </div>)}
      {revokeId && <div className={`${styles.notice} ${styles.inlineNotice}`}><AlertCircle size={17} aria-hidden="true" /><div><p>Revoke this installation key? Incoming emails from this installation will stop being imported. Existing payment records remain available.</p><div className={styles.actions}><button type="button" className={`${styles.button} ${styles.danger}`} disabled={Boolean(busy)} onClick={() => void mutate('revoke', revokeId)}>{busy === 'revoke' ? 'Revoking…' : 'Revoke this key'}</button><button type="button" className={styles.button} disabled={Boolean(busy)} onClick={() => setRevokeId('')}>Keep connection</button></div></div></div>}
      {connection && !setup && <div className={styles.connectionFields}>
        <label className={styles.field}><span>First import</span><select className={styles.select} value={lookback} disabled={Boolean(busy)} onChange={event => setLookback(event.target.value)}><option value="0">New emails from setup time</option><option value="1">Include the previous day</option><option value="3">Include the previous 3 days</option><option value="7">Include the previous 7 days</option></select></label>
        <button type="button" className={styles.button} disabled={Boolean(busy)} onClick={() => void mutate('create')}>{busy === 'create' ? 'Creating key…' : 'Create installation key'}</button>
      </div>}
      {setup && <section className={styles.setup} aria-labelledby="payment-mail-setup-title">
        <h3 id="payment-mail-setup-title">Install the payment email importer</h3>
        <p className={styles.subtle}>This key is shown only now. Copy it into the script properties before leaving this page.</p>
        <label className={styles.field}><span>KLGCR_PAYMENT_MAIL_ORIGIN</span><span className={styles.secretRow}><input className={styles.input} readOnly value={setup.origin} /><button type="button" className={styles.button} onClick={() => void copy(setup.origin, 'Website origin')}><Copy size={13} aria-hidden="true" />Copy origin</button></span></label>
        <label className={styles.field}><span>KLGCR_PAYMENT_MAIL_TOKEN</span><span className={styles.secretRow}><input className={styles.input} type={showKey ? 'text' : 'password'} autoComplete="off" readOnly value={setup.token} spellCheck={false} /><button type="button" className={styles.button} onClick={() => void copy(setup.token, 'Installation key')}><Copy size={13} aria-hidden="true" />Copy key</button></span></label>
        <label className={styles.tokenToggle}><input type="checkbox" checked={showKey} onChange={event => setShowKey(event.target.checked)} />Show installation key</label>
        <ol>
          <li>Sign in to Google as <strong>{setup.mailbox}</strong> and create an Apps Script project for the payment importer.</li>
          <li>Paste the downloaded importer into <code>Code.gs</code>. Enable the manifest file in Project Settings and replace <code>appsscript.json</code> with the downloaded manifest.</li>
          <li>In Project Settings → Script Properties, add the two property names and values above.</li>
          <li>Run <code>installPaymentMail()</code> once and complete the Google authorization. It installs a mailbox check every 15 minutes. Return here and select <strong>Check connection</strong>.</li>
        </ol>
        <p className={styles.subtle}>Import begins from {dateTime.format(new Date(setup.enabledFrom))} MYT. Creating a key alone does not start the mailbox checks.</p>
      </section>}
      {connection && <details className={styles.senderList}><summary>Registered company email contacts ({connection.senders.length})</summary>{connection.senders.length ? <ul>{connection.senders.map(sender => <li key={sender.email}><strong>{sender.email}</strong>{sender.accounts.length ? ` · ${sender.accounts.map(account => `${account.name || account.account_key} (${account.kind === 'rental' ? 'Rental' : 'Utilities'})`).join(' · ')}` : ''}</li>)}</ul> : <p>Save company email contacts in Rental & Utilities before matching incoming payments.</p>}</details>}
    </div>
  </details>;
}
