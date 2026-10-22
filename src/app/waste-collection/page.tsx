import '@/app/waste-portal.css';
import Image from 'next/image';
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
  return <main className="waste-public"><header className="waste-header"><div className="waste-logo"><Image src="/klg-campus-residence-logo.png" alt="KLG Campus Residence" width={200} height={100} priority style={{width: 'auto', height: '72px', objectFit: 'contain'}}/></div><span className="waste-eyebrow">SECURITY PORTAL</span><h1>Waste Collection</h1><p>Weekly collection: Tuesday · Friday · Sunday</p><div className="waste-officer"><span className="waste-online"/>Cleantech <span>•</span> {access.guard_name}</div></header><WasteSecurityForm schedules={options}/></main>;
}
