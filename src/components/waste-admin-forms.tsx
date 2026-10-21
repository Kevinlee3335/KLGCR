'use client';
import { useActionState, useState } from 'react';
import { createSecurityLink, saveWasteSchedule, type WasteActionState } from '@/app/(dashboard)/admin/waste-collection/actions';
import { malaysiaDate } from '@/lib/waste/shared';
export function WasteAdminForms() {
  const [schedule, save, saving] = useActionState<WasteActionState, FormData>(saveWasteSchedule, {});
  const [access, create, creating] = useActionState<WasteActionState, FormData>(createSecurityLink, {});
  const [copied, setCopied] = useState(false);
  return <div className="waste-admin-grid">
    <section className="panel"><h2>Monthly schedule</h2><p className="subtle">Upload Cleantech’s schedule and confirm collection dates below. Only confirmed dates are checked automatically.</p>
      <form action={save} className="waste-form">
        <label>Month<input required type="month" name="month" defaultValue={malaysiaDate().slice(0, 7)}/></label>
        <label>Original schedule (optional)<input type="file" name="schedule" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"/><small>PDF, image or Excel · max 3 MB</small></label>
        <label>Confirmed collection dates<textarea required name="dates" rows={3} placeholder="2, 5, 9, 12, 16, 19, 23, 26, 30"/><small>Enter days of the month or YYYY-MM-DD, separated by commas or new lines. Saving adds dates; existing records stay intact.</small></label>
        <label>Expected by (optional)<input type="time" name="deadline"/><small>Leave empty if the schedule only specifies a date. Missing records are flagged after that day ends.</small></label>
        {schedule.error && <p className="error" role="alert">{schedule.error}</p>}{schedule.success && <p role="status">✓ {schedule.success}</p>}
        <button className="button" disabled={saving}>{saving ? 'Saving…' : 'Save confirmed schedule'}</button>
      </form></section>
    <section className="panel"><h2>Security link</h2><p className="subtle">Create one link per officer or team. The link only allows submitting waste collections.</p>
      <form action={create} className="waste-form"><label>Security officer / team name<input required name="guardName" maxLength={100} placeholder="e.g. Security — Day Shift"/></label><button className="button" disabled={creating}>{creating ? 'Creating…' : 'Create Security link'}</button></form>
      {access.error && <p className="error" role="alert">{access.error}</p>}
      {access.link && <div className="waste-link"><p>Copy this link now. It is only displayed once.</p><a href={access.link} target="_blank" rel="noreferrer">Open Security page ↗</a><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(new URL(access.link!, window.location.origin).href); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copied' : 'Copy link'}</button><textarea readOnly aria-label="Security link" value={typeof window === 'undefined' ? access.link : new URL(access.link, window.location.origin).href}/></div>}
    </section>
  </div>;
}
