/* eslint-disable @next/next/no-img-element */
import '@/app/waste-portal.css';
import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { WasteAdminForms } from '@/components/waste-admin-forms';
import { CopyWhatsAppButton } from '@/components/copy-whatsapp-button';
import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { collectionStatus, malaysiaDate, WASTE_BUCKET } from '@/lib/waste/shared';
import { disableSecurityLink } from './actions';

export const dynamic = 'force-dynamic';
type Database = ReturnType<typeof createAdminClient>;
type Collection = {
  id: string; schedule_id: string | null; collected_at: string; bins: number;
  guard_name: string; created_at: string; remarks: string | null; photos: string[];
};
type Schedule = {
  collection_date: string; deadline: string | null; review_status: string; review_note: string | null;
  reviewed_at: string | null; collection: Collection | null;
};
const collectionColumns = 'id,schedule_id,collected_at,bins,guard_name,created_at,remarks,photos';
const scheduleColumns = `collection_date,deadline,review_status,review_note,reviewed_at,collection:waste_collections!schedule_id(${collectionColumns})`;
const timeFormat = new Intl.DateTimeFormat('en-MY', {
  timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', second: 'numeric',
});
function displayTime(value: string) { return timeFormat.format(new Date(value)); }

export default async function WasteAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(['admin', 'management_viewer']);
  const params = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month || '') ? params.month! : malaysiaDate().slice(0, 7);
  const db = createAdminClient();

  return <AppShell profile={profile} title="Waste Collection">
    {params.error && <p className="error" role="alert">{params.error}</p>}
    <div className="section-head"><div><h2>Cleantech · Waste Collection</h2><p className="subtle">Every Tuesday · Friday · Sunday — automatic weekly collection schedule</p></div><form className="inline-form"><label>Month<input type="month" name="month" defaultValue={month}/></label><button className="button">View</button></form></div>
    <Suspense key={month} fallback={<p className="subtle" role="status">Loading collection schedule…</p>}>
      <MonthCollections db={db} month={month} />
    </Suspense>
    <details className="panel waste-section waste-disclosure"><summary>Friday report · View details</summary><p className="subtle">Automatically included in Friday’s daily summary. Includes this week and older unresolved collections. Friday collections remain scheduled until their deadline passes.</p>
      <Suspense fallback={<p className="subtle" role="status">Loading Friday report…</p>}><FridayReport /></Suspense>
    </details>
    {profile.role === 'admin' && <details className="panel waste-section waste-disclosure"><summary>Settings · Collection schedule &amp; Security links</summary><WasteAdminForms/></details>}
    <details className="panel waste-section waste-disclosure"><summary>Uploaded schedules · View files</summary>
      <Suspense key={month} fallback={<p className="subtle" role="status">Loading uploaded schedules…</p>}>
        <UploadedSchedules db={db} month={month}/>
      </Suspense>
    </details>
    {profile.role === 'admin' && <details className="panel waste-section waste-disclosure"><summary>Security access · Manage existing links</summary>
      <Suspense fallback={<p className="subtle" role="status">Loading Security links…</p>}><SecurityLinks db={db} /></Suspense>
    </details>}
  </AppShell>;
}

async function MonthCollections({ db, month }: { db: Database; month: string }) {
  const start = `${month}-01`, next = new Date(`${start}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const end = next.toISOString().slice(0, 10);
  const [planned, actual] = await Promise.all([
    db.from('waste_schedule_dates').select(scheduleColumns).gte('collection_date', start).lt('collection_date', end).order('collection_date').returns<Schedule[]>(),
    db.from('waste_collections').select(collectionColumns).gte('collected_at', `${start}T00:00:00+08:00`).lt('collected_at', `${end}T00:00:00+08:00`).order('collected_at', { ascending: false }).returns<Collection[]>(),
  ]);
  if (planned.error || actual.error) return <p className="error" role="alert">Waste Collection is unavailable. The database setup may still be pending. Please try again later.</p>;
  const schedules = planned.data || [];
  const records = actual.data || [];
  const associated = schedules.flatMap(s => s.collection ? [s.collection] : []);
  const allRecords = [...new Map([...records, ...associated].map(row => [row.id, row])).values()];
  const missing = schedules.filter(s => s.review_status !== 'cancelled' && collectionStatus(s.collection_date, s.deadline, s.collection?.collected_at || null).startsWith('No record'));
  return <>
    <div className="waste-stats"><div className="panel"><strong>{schedules.filter(s => s.review_status !== 'cancelled').length}</strong><span>Planned collections</span></div><div className="panel"><strong>{records.length}</strong><span>Collections this month</span></div><div className="panel"><strong>{records.reduce((sum, r) => sum + r.bins, 0)}</strong><span>Bins collected</span></div><div className="panel"><strong>{missing.length}</strong><span>No collection record</span></div></div>
    <section className="panel waste-section"><h2>Collection status · {month}</h2>
      {!schedules.length && <p>No schedule for this month.</p>}
      <div className="waste-records">{schedules.map(s => {
        const record = s.collection;
        const status = s.review_status === 'cancelled' ? 'Cancelled schedule' : collectionStatus(s.collection_date, s.deadline, record?.collected_at || null);
        return <article className="waste-record" key={s.collection_date}><div className="section-head"><strong>{s.collection_date}{s.deadline ? ` · by ${s.deadline.slice(0, 5)}` : ''}</strong><span className={`badge waste-status-${status === 'Completed' ? 'done' : status === 'Delayed' ? 'late' : status.startsWith('No record') ? 'missing' : 'planned'}`}>{status}</span></div>{record && <p>Actual: {displayTime(record.collected_at)} · {record.bins} bins · {record.guard_name}</p>}{s.review_status !== 'open' && <p>Admin: {s.review_status.replaceAll('_', ' ')} · {s.review_note}</p>}{s.reviewed_at && <small>Last reviewed: {displayTime(s.reviewed_at)}</small>}</article>;
      })}</div>
    </section>
    <section className="panel waste-section"><h2>Collection records &amp; photos</h2><p className="subtle">Collections in the selected month, plus records linked to this month’s schedule.</p>
      <Suspense fallback={<p className="subtle" role="status">Loading collection evidence…</p>}><Evidence db={db} records={allRecords} /></Suspense>
    </section>
  </>;
}

async function signPaths(db: Database, paths: string[]) {
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data, error } = await db.storage.from(WASTE_BUCKET).createSignedUrls([...new Set(paths)], 3600);
    if (error) return null;
    for (const row of data || []) if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl);
  }
  return urls;
}

async function Evidence({ db, records }: { db: Database; records: Collection[] }) {
  const urls = await signPaths(db, records.flatMap(row => row.photos));
  return <div className="waste-records">
    {!urls && <p className="error" role="alert">Unable to load collection photos. Please try again later.</p>}
    {!records.length && <p>No collections recorded.</p>}
    {records.map(row => <article className="waste-record" key={row.id}><strong>{displayTime(row.collected_at)} · {row.bins} bins</strong><p>Security: {row.guard_name} · {row.schedule_id ? 'Scheduled collection' : 'Extra / unplanned collection'}</p><small>Submitted: {displayTime(row.created_at)}</small>{row.remarks && <p>{row.remarks}</p>}<div className="waste-photos">{row.photos.map(path => {
      const url = urls?.get(path);
      return url && <a key={path} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Waste collection evidence" loading="lazy"/></a>;
    })}</div></article>)}
  </div>;
}

async function FridayReport() {
  const client = await createClient();
  const { data, error } = await client.rpc('waste_collection_report_text', { p_date: malaysiaDate(), p_asof: new Date().toISOString() });
  if (error) return <p className="error" role="alert">Unable to load the Friday report. Please try again later.</p>;
  const weeklyReport = String(data || '').replaceAll('NO RECORD - confirm with Security', 'NO RECORD');
  return <><pre className="waste-report">{weeklyReport}</pre><CopyWhatsAppButton text={weeklyReport}/></>;
}

async function UploadedSchedules({ db, month }: { db: Database; month: string }) {
  const { data, error } = await db.from('waste_schedule_uploads').select('id,source_path,source_name,created_at').eq('schedule_month', `${month}-01`).order('created_at', { ascending: false });
  if (error) return <p className="error" role="alert">Unable to load uploaded schedules. Please try again later.</p>;
  const rows = data || [];
  const urls = await signPaths(db, rows.flatMap(row => row.source_path ? [row.source_path] : []));
  return <>
    {!urls && <p className="error" role="alert">Unable to load schedule file links. Please try again later.</p>}
    {rows.map(row => <p key={row.id}>{row.source_path ? (urls?.get(row.source_path) ? <a href={urls.get(row.source_path)} target="_blank" rel="noreferrer">{row.source_name || 'View schedule'} ↗</a> : (row.source_name || 'Schedule file')) : 'Dates entered manually'} · {displayTime(row.created_at)}</p>)}
  </>;
}

async function SecurityLinks({ db }: { db: Database }) {
  const { data, error } = await db.from('waste_security_links').select('id,guard_name,is_active').order('created_at', { ascending: false });
  if (error) return <p className="error" role="alert">Unable to load Security links. Please try again later.</p>;
  return <>{data?.map(link => <div className="section-head" key={link.id}><p>{link.guard_name} · {link.is_active ? 'Active' : 'Disabled'}</p>{link.is_active && <form action={disableSecurityLink}><input type="hidden" name="id" value={link.id}/><button className="button secondary">Disable link</button></form>}</div>)}</>;
}
