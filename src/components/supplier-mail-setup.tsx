'use client';
import { useState } from 'react';
import { prepareSupplierConnection, revokeSupplierConnection } from '@/app/(dashboard)/documents/suppliers/actions';
export function SupplierMailSetup({connections}:{connections:{id:string;created_at:string;last_received_at:string|null}[]}) {
  const [token,setToken]=useState('');
  const [origin,setOrigin]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [revoked,setRevoked]=useState<string[]>([]);
  return <details className="panel"><summary>Gmail connection setup (Admin)</summary>
    <p>Connect klgresidenceenquiry@gmail.com to import incoming Sigma and MFE emails and PDF attachments from 1 January 2023. Google authorization is required once. Synchronization checks every 15 minutes after installation.</p>
    <ol>
      <li>Open <a href="https://script.google.com/home/start" target="_blank" rel="noreferrer">Google Apps Script</a> using the company Gmail account and create a new project.</li>
      <li>Copy the <a href="/supplier-mail/sync.gs" target="_blank" rel="noreferrer">sync script</a> into Code.gs.</li>
      <li>In Project Settings, enable “Show appsscript.json manifest file”. Replace that file with this <a href="/supplier-mail/appsscript.json" target="_blank" rel="noreferrer">manifest</a>.</li>
      <li>Add Script Properties: <strong>KLGCR_ARCHIVE_ORIGIN</strong> = <code>{origin || "Generate a connection key below to show this site’s address"}</code> and <strong>KLGCR_ARCHIVE_TOKEN</strong> = the connection key generated below.</li>
      <li>Select <strong>install</strong>, click Run, and approve the Google authorization. Historical import continues in batches; check Executions for any failures.</li>
    </ol>
    <button className="button" disabled={busy} onClick={async()=>{setOrigin(window.location.origin);setBusy(true);setError('');try{setToken(await prepareSupplierConnection());}catch{setError('Unable to generate connection key.');}finally{setBusy(false);}}}>Generate connection key</button>
    {token && <label>Connection key (shown only here)<input readOnly value={token} onFocus={event=>event.target.select()} style={{width:'100%'}}/></label>}
    {error && <p role="alert">{error}</p>}
    {connections.filter(c=>!revoked.includes(c.id)).map(c=><p key={c.id}>Connection created {new Date(c.created_at).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'})} · {c.last_received_at?`Last received ${new Date(c.last_received_at).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'})}`:'Waiting for first email'} <button className="button" disabled={busy} onClick={async()=>{setBusy(true);try{await revokeSupplierConnection(c.id);setRevoked(v=>[...v,c.id]);}catch{setError('Unable to revoke connection.');}finally{setBusy(false);}}}>Revoke</button></p>)}
  </details>;
}
