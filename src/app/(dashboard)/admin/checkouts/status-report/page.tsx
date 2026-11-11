import {countOccupancyRooms,malaysiaDate} from '@/lib/checkout-occupancy-report';
import {checkoutProgress} from '@/lib/checkouts';
import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {CheckoutStatusDashboard,type CheckoutStatusReport} from '@/components/checkout-status-dashboard';
import {requireRole} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {PrintReportButton} from '@/components/print-report-button';
export default async function Page(){const profile=await requireRole(['admin','management_viewer']);const db=await createClient();const [readyCount,{data,error},{data:rooms,error:roomError}]=await Promise.all([countOccupancyRooms(db).catch(()=>null),db.rpc('checkout_status_report',{p_date:malaysiaDate(),p_group:'ALL'}),db.from('checkout_rooms').select('id,status,cleaner_id,utmspace_defects,defects:checkout_defects(description,status)').is('deleted_at',null)]);return <AppShell profile={profile} title="Check-out Status Report"><div className="section-head no-print"><Link className="button secondary" href="/admin/checkouts">Back to Check-out Rooms</Link><PrintReportButton/></div>{(error||roomError||readyCount===null)?<p className="error">Unable to load the status report. Please refresh.</p>:<CheckoutStatusDashboard report={{...(data as CheckoutStatusReport),ready:readyCount}} defectRoomCount={(rooms||[]).filter(r=>checkoutProgress(r.defects).total>0).length} sources={rooms||[]} details/>}</AppShell>}
