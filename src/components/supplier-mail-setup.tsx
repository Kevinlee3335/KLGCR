'use client';
import { useState } from 'react';
import { prepareSupplierConnection, revokeSupplierConnection } from '@/app/(dashboard)/documents/suppliers/actions';
const date = new Intl.DateTimeFormat('en-MY', { timeZone:'Asia/Kuala_Lumpur', dateStyle:'medium', timeStyle:'short' });

export function SupplierMailSetup({connections}:{connections:{id:string;created_at:string;last_received_at:string|null;last_checked_at:string|null}[]}) {
  const [token,setToken]=useState('');
  const [origin,setOrigin]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [revoked,setRevoked]=useState<string[]>([]);
  return <details id="supplier-gmail-setup" className="panel supplier-setup"><summary>Gmail connection setup (Admin)</summary>
    <p>Connect klgresidenceenquiry@gmail.com to import emails and PDF attachments from approved supplier senders. Synchronization checks every 15 minutes after installation.</p>
    <ol>
      <li>Open <a href="https://script.google.com/home/start" target="_blank" rel="noreferrer">Google Apps Script</a> in the company Gmail account. Open the existing supplier archive project, or create one for a first-time connection.</li>
      <li>Copy the <a href="/supplier-mail/sync.gs" target="_blank" rel="noreferrer">sync script</a> into Code.gs.</li>
      <li>In Project Settings, enable “Show appsscript.json manifest file”. Replace that file with this <a href="/supplier-mail/appsscript.json" target="_blank" rel="noreferrer">manifest</a>.</li>
      <li>Keep the existing <strong>KLGCR_ARCHIVE_ORIGIN</strong> and <strong>KLGCR_ARCHIVE_TOKEN</strong> Script Properties. For a new connection, set the origin to <code>{origin || 'this KLGCR site’s address'}</code> and use the key generated below as the token.</li>
      <li>Select <strong>install</strong>, click Run, and approve the Google authorization. Historical import continues in batches; check Executions for any failures.</li>
    </ol>
    <button className="button" type="button" disabled={busy} onClick={async()=>{setOrigin(window.location.origin);setBusy(true);setError('');try{setToken(await prepareSupplierConnection());}catch{setError('Unable to generate connection key.');}finally{setBusy(false);}}}>Generate connection key</button>
    {token && <label>Connection key (shown only here)<input readOnly value={token} onFocus={event=>event.target.select()} style={{width:'100%'}}/></label>}
    {error && <p role="alert">{error}</p>}
    {connections.filter(c=>!revoked.includes(c.id)).map(c=><p key={c.id}>
      Connection created {date.format(new Date(c.created_at))}
      {c.last_checked_at&&` · Last checked ${date.format(new Date(c.last_checked_at))} MYT`}
      {c.last_received_at?` · Last received ${date.format(new Date(c.last_received_at))} MYT`:' · Waiting for first email'}{' '}
      <button className="button" type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await revokeSupplierConnection(c.id);setRevoked(v=>[...v,c.id]);}catch{setError('Unable to revoke connection.');}finally{setBusy(false);}}}>Revoke</button>
    </p>)}
  </details>;
}
