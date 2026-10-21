import { securityAccess } from '@/lib/waste/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { malaysiaDate } from '@/lib/waste/shared';
import { WasteSecurityForm } from '@/components/waste-security-form';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Security · Waste Collection', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function WasteCollectionPage() {
  const access = await securityAccess();
  if (!access) return <main className="waste-public"><h1>Waste Collection</h1><p>Please open the Security link provided by KLGCR Admin. Your link may have been disabled.</p></main>;
  const db = createAdminClient();
  const { data, error } = await db.from('waste_schedule_dates').select('id,collection_date,deadline,waste_collections(id)').neq('review_status', 'cancelled').lte('collection_date', malaysiaDate()).order('collection_date', { ascending: false });
  if (error) return <main className="waste-public"><h1>Waste Collection</h1><p role="alert">Cannot load the schedule. Please refresh and try again.</p></main>;
  const options = (data || []).filter(row => !row.waste_collections?.length).map(row => ({ id: row.id as string, date: row.collection_date as string }));
  return <main className="waste-public"><div className="waste-brand">KLG CAMPUS RESIDENCE</div><h1>Waste Collection</h1><p className="subtle">Cleantech · Security: {access.guard_name}</p><WasteSecurityForm schedules={options}/></main>;
}
