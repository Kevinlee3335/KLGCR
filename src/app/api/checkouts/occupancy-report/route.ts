import {NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {loadOccupancyReport,reportDate} from '@/lib/checkout-occupancy-report';
import {occupancyPdf} from '@/lib/checkout-occupancy-pdf';
export const runtime='nodejs';
export async function GET(req:Request){const p=await getSessionProfile();if(!p||!['admin','management_viewer'].includes(p.role))return new NextResponse('Access denied',{status:403});const date=reportDate(new URL(req.url).searchParams.get('date')||'');if(!date)return new NextResponse('Invalid report date',{status:400});try{const rows=await loadOccupancyReport(await createClient(),date);if(rows.some(r=>!r.occupancy_pax))return new NextResponse('Room capacity must be confirmed before downloading this report.',{status:409});const bytes=await occupancyPdf(date,rows);return new NextResponse(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="UTMSPACE-Rooms-Ready-${date}.pdf"`,'Cache-Control':'private, no-store'}});}catch{return new NextResponse('Unable to generate report. Please try again.',{status:503});}}
