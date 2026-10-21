import '@/app/waste-portal.css';
/* eslint-disable @next/next/no-img-element */
import { AppShell } from '@/components/app-shell';
import { WasteAdminForms } from '@/components/waste-admin-forms';
import { CopyWhatsAppButton } from '@/components/copy-whatsapp-button';
import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { collectionStatus, malaysiaDate, WASTE_BUCKET } from '@/lib/waste/shared';
import { disableSecurityLink, reviewWasteSchedule } from './actions';
export const dynamic = 'force-dynamic';
function displayTime(value: string) { return new Date(value).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }); }
export default async function WasteAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireRole(['admin', 'management_viewer']); const params = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month || '') ? params.month! : malaysiaDate().slice(0, 7);
  const start = `${month}-01`, next = new Date(`${start}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1); const end = next.toISOString().slice(0, 10);
  const db = createAdminClient(), client = await createClient();
  const [planned, actual, uploads, links, weekly] = await Promise.all([
    db.from('waste_schedule_dates').select('*').gte('collection_date', start).lt('collection_date', end).order('collection_date'),
    db.from('waste_collections').select('*').gte('collected_at', `${start}T00:00:00+08:00`).lt('collected_at', `${end}T00:00:00+08:00`).order('collected_at', { ascending: false }),
    db.from('waste_schedule_uploads').select('*').eq('schedule_month', start).order('created_at', { ascending: false }),
    db.from('waste_security_links').select('id,guard_name,is_active,created_at').order('created_at', { ascending: false }),
    client.rpc('waste_collection_report_text', { p_date: malaysiaDate(), p_asof: new Date().toISOString() }),
  ]);
  const loadError = [planned.error, actual.error, uploads.error, links.error, weekly.error].find(Boolean);
  if (loadError) return <AppShell profile={profile} title="Waste Collection"><p className="error">Waste Collection is unavailable. The database setup may still be pending. Please try again later.</p></AppShell>;
  const scheduleIds = (planned.data || []).map(s => s.id);
  const associated = scheduleIds.length ? await db.from('waste_collections').select('*').in('schedule_id', scheduleIds) : { data: [], error: null };
  if (associated.error) throw associated.error;
  const bySchedule = new Map((associated.data || []).map(row => [row.schedule_id, row]));
  const allRecords = [...new Map([...(actual.data || []), ...(associated.data || [])].map(row => [row.id, row])).values()];
  const paths: string[] = [...allRecords.flatMap(row => row.photos as string[]), ...(uploads.data || []).flatMap(row => row.source_path ? [row.source_path] : [])];
  const signed = paths.length ? await db.storage.from(WASTE_BUCKET).createSignedUrls(paths, 3600) : { data: [], error: null };
  if (signed.error) throw signed.error;
  const urls = new Map(signed.data?.map(row => [row.path, row.signedUrl]));
  const missing = (planned.data || []).filter(s => s.review_status !== 'cancelled' && collectionStatus(s.collection_date, s.deadline, bySchedule.get(s.id)?.collected_at || null).startsWith('No record'));
  return <AppShell profile={profile} title="Waste Collection">
    {params.error && <p className="error" role="alert">{params.error}</p>}
    <div className="section-head"><div><h2>Cleantech · Waste Collection</h2><p className="subtle">Collection records, photos and dates requiring your attention</p></div><form className="inline-form"><label>Month<input type="month" name="month" defaultValue={month}/></label><button className="button">View</button></form></div>
    <div className="waste-stats"><div className="panel"><strong>{planned.data?.filter(s => s.review_status !== 'cancelled').length || 0}</strong><span>Planned collections</span></div><div className="panel"><strong>{actual.data?.length || 0}</strong><span>Collections this month</span></div><div className="panel"><strong>{actual.data?.reduce((sum, r) => sum + r.bins, 0) || 0}</strong><span>Bins collected</span></div><div className="panel"><strong>{missing.length}</strong><span>Needs confirmation</span></div></div>
    
    <section className="panel waste-section"><h2>Collection checklist · {month}</h2><p className="subtle">Check the status beside each date. If there is no record, confirm with Security.</p>
      {!planned.data?.length && <p>No confirmed schedule for this month.</p>}
      <div className="waste-records">{planned.data?.map(s => { const record = bySchedule.get(s.id); const status = s.review_status === 'cancelled' ? 'Cancelled schedule' : collectionStatus(s.collection_date, s.deadline, record?.collected_at || null); return <article className="waste-record" key={s.id}><div className="section-head"><strong>{s.collection_date}{s.deadline ? ` · by ${s.deadline.slice(0, 5)}` : ''}</strong><span className={`badge waste-status-${status === 'Completed' ? 'done' : status === 'Delayed' ? 'late' : status.startsWith('No record') ? 'missing' : 'planned'}`}>{status}</span></div>{record && <p>Actual: {displayTime(record.collected_at)} · {record.bins} bins · {record.guard_name}</p>}{s.review_status !== 'open' && <p>Admin: {s.review_status.replaceAll('_', ' ')} · {s.review_note}</p>}{s.reviewed_at && <small>Last reviewed: {displayTime(s.reviewed_at)}</small>}{profile.role === 'admin' && <details><summary>Confirm / add note</summary><form action={reviewWasteSchedule} className="waste-form"><input type="hidden" name="id" value={s.id}/><label>Confirmation<select name="reviewStatus" defaultValue={s.review_status}><option value="open">Pending confirmation</option><option value="confirmed_missed">Confirmed Cleantech missed collection</option><option value="security_missing">Collection happened — Security did not submit</option><option value="cancelled">Schedule cancelled</option></select></label><label>Confirmation note<textarea name="reviewNote" defaultValue={s.review_note || ''} maxLength={1000}/></label><button className="button secondary">Save confirmation</button></form></details>}</article>; })}</div>
    </section>
    <section className="panel waste-section"><h2>Collection records & photos</h2><p className="subtle">Collections in the selected month, plus records linked to this month’s schedule.</p><div className="waste-records">{!allRecords.length && <p>No collections recorded.</p>}{allRecords.map(row => <article className="waste-record" key={row.id}><strong>{displayTime(row.collected_at)} · {row.bins} bins</strong><p>Security: {row.guard_name} · {row.schedule_id ? 'Scheduled collection' : 'Extra / unplanned collection'}</p><small>Submitted: {displayTime(row.created_at)}</small>{row.remarks && <p>{row.remarks}</p>}<div className="waste-photos">{(row.photos as string[]).map(path => urls.get(path) && <a key={path} href={urls.get(path) || undefined} target="_blank" rel="noreferrer"><img src={urls.get(path) || undefined} alt="Waste collection evidence" loading="lazy"/></a>)}</div></article>)}</div></section>
    <details className="panel waste-section waste-disclosure"><summary>Friday report · View details</summary><p className="subtle">Automatically included in Friday’s daily summary. Includes this week and older unresolved collections. Friday collections remain scheduled until their deadline passes.</p><pre className="waste-report">{String(weekly.data || '')}</pre><CopyWhatsAppButton text={String(weekly.data || '')}/></details>
    {profile.role === 'admin' && <details className="panel waste-section waste-disclosure"><summary>Settings · Collection schedule & Security links</summary><WasteAdminForms/></details>}
    <details className="panel waste-section waste-disclosure"><summary>Uploaded schedules · View files</summary>{uploads.data?.map(row => <p key={row.id}>{row.source_path && urls.get(row.source_path) ? <a href={urls.get(row.source_path) || undefined} target="_blank" rel="noreferrer">{row.source_name || 'View schedule'} ↗</a> : 'Dates entered manually'} · {displayTime(row.created_at)}</p>)}</details>
    {profile.role === 'admin' && <details className="panel waste-section waste-disclosure"><summary>Security access · Manage existing links</summary>{links.data?.map(link => <div className="section-head" key={link.id}><p>{link.guard_name} · {link.is_active ? 'Active' : 'Disabled'}</p>{link.is_active && <form action={disableSecurityLink}><input type="hidden" name="id" value={link.id}/><button className="button secondary">Disable link</button></form>}</div>)}</details>}
  </AppShell>;
}
