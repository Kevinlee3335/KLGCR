'use client';
import { useActionState, useState } from 'react';
import { createSecurityLink, type WasteActionState } from '@/app/(dashboard)/admin/waste-collection/actions';
export function WasteAdminForms() {
  const [access, create, creating] = useActionState<WasteActionState, FormData>(createSecurityLink, {});
  const [copied, setCopied] = useState(false);
  return <div className="waste-admin-grid">
    <section className="panel"><h2>Weekly collection schedule</h2><p className="subtle">Automatically repeats every week. No monthly upload or date entry needed.</p><div className="waste-weekdays"><span>Tuesday</span><span>Friday</span><span>Sunday</span></div><p>Collection deadline: end of each scheduled day (Malaysia time).</p><p className="subtle">Tracking starts 21 October 2026. Missing records are flagged after the deadline for confirmation with Security.</p></section>
    <section className="panel"><h2>Security link</h2><p className="subtle">Create one link per officer or team. The link only allows submitting waste collections.</p>
      <form action={create} className="waste-form"><label>Security officer / team name<input required name="guardName" maxLength={100} placeholder="e.g. Security — Day Shift"/></label><button className="button" disabled={creating}>{creating ? 'Creating…' : 'Create Security link'}</button></form>
      {access.error && <p className="error" role="alert">{access.error}</p>}
      {access.link && <div className="waste-link"><p>Copy this link now. It is only displayed once.</p><a href={access.link} target="_blank" rel="noreferrer">Open Security page ↗</a><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(new URL(access.link!, window.location.origin).href); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copied' : 'Copy link'}</button><textarea readOnly aria-label="Security link" value={typeof window === 'undefined' ? access.link : new URL(access.link, window.location.origin).href}/></div>}
    </section>
  </div>;
}
