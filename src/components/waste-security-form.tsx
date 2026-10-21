'use client';
import { useState } from 'react';
import { malaysiaDate } from '@/lib/waste/shared';
async function compressPhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Cannot process photo.')), 'image/jpeg', .72));
    if (blob.size > 700_000) throw new Error('Photo is too large. Please take a lower resolution photo.');
    return new File([blob], 'collection.jpg', { type: 'image/jpeg' });
  } finally { bitmap.close(); }
}
export function WasteSecurityForm({ schedules }: { schedules: { id: string; date: string }[] }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const today = malaysiaDate();
  if (done) return <section className="panel"><h2>✓ Completed</h2><p>Your collection record and photos have been saved.</p><button className="button" onClick={() => { setDone(false); setRequestId(crypto.randomUUID()); }}>Record another collection</button></section>;
  return <form className="panel waste-form" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const files = form.getAll('photos').filter((file): file is File => file instanceof File && file.size > 0);
      if (!files.length || files.length > 5) throw new Error('Upload 1–5 photos.');
      form.delete('photos');
      for (const file of files) form.append('photos', await compressPhoto(file));
      form.set('requestId', requestId);
      const response = await fetch('/api/waste/submit', { method: 'POST', body: form });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Submission failed.');
      setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit. Please retry.'); }
    finally { setBusy(false); }
  }}>
    <label>Collection date<input required type="date" name="date" max={today} defaultValue={today}/></label>
    <label>Collection time (Malaysia)<input required type="time" name="time" defaultValue={new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' }).format(new Date())}/></label>
    <label>Bins collected<input required name="bins" type="number" min="1" max="999" step="1" inputMode="numeric" placeholder="Number of bins"/></label>
    <label>Scheduled collection<select name="scheduleId" defaultValue={schedules.find(s => s.date === today)?.id || ''}><option value="">Extra / unplanned collection</option>{schedules.map(s => <option value={s.id} key={s.id}>{s.date}{s.date < today ? ' · Earlier scheduled date' : ''}</option>)}</select><small>For a delayed collection, select the original scheduled date.</small></label>
    <label className="waste-upload">📷 Take / upload photos<input required name="photos" type="file" accept="image/*" multiple/><small>1–5 photos. Use your phone camera or photo library.</small></label>
    <label>Remarks (optional)<textarea name="remarks" maxLength={1000} rows={3}/></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="button" type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Complete'}</button>
  </form>;
}
