'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireRole} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {reportDate} from '@/lib/checkout-occupancy-report';
const route='/admin/checkouts/painting';
function fail(message:string):never{redirect(`${route}?error=${encodeURIComponent(message)}`)}
export async function assignPainting(form:FormData){
 const actor=await requireRole(['admin']);const db=await createClient();
 const rooms=[...new Set(form.getAll('rooms').map(String))];
 const reasons=[...new Set(form.getAll('reasons').map(String))];const worker=String(form.get('worker')||'').trim();const date=String(form.get('date')||'');
 const notes=String(form.get('notes')||'').trim();
 if(!rooms.length||rooms.length>100||!worker||worker.length>100||!reportDate(date)||!reasons.length||reasons.some(r=>!['Moldy','Wall stain','Dirty','Peeling paint','Other'].includes(r))||notes.length>2000)fail('Select rooms, a reason, work date and worker name.');
 if(reasons.includes('Other')&&!notes)fail('Enter notes for Other.');
 const {data:valid,error:readError}=await db.from('checkout_rooms').select('id,status').in('id',rooms).is('deleted_at',null);
 if(readError||valid?.length!==rooms.length)fail('Some rooms are unavailable. Refresh and select again.');
 if(valid?.some(r=>r.status==='ready_for_occupancy'))fail('A selected room is already Ready for Occupancy. Review its readiness before assigning new work.');
 const {error}=await db.from('checkout_paint_tasks').insert(rooms.map(checkout_room_id=>({checkout_room_id,area:'room',reasons,worker_name:worker,work_date:date,notes:notes||null,created_by:actor.id})));
 if(error)fail(error.code==='23505'?'A selected room already has unfinished painting work. Update its worker below.':error.message);
 revalidatePath(route);revalidatePath('/admin/checkouts');redirect(`${route}?success=assigned`);
}
export async function updatePainting(form:FormData){
 await requireRole(['admin']);const db=await createClient();const id=String(form.get('id')||'');const status=String(form.get('status')||'');const previous=String(form.get('previous')||'');const worker=String(form.get('worker')||'').trim();
 if(!id||!['assigned','in_progress','completed'].includes(status)||!worker||worker.length>100)fail('Enter the worker and a valid status.');
 const {data,error}=await db.from('checkout_paint_tasks').update({status,worker_name:worker}).eq('id',id).eq('updated_at',previous).select('id').maybeSingle();
 if(error||!data)fail(error?.message||'This task changed. Refresh and try again.');
 revalidatePath(route);revalidatePath('/admin/checkouts');redirect(`${route}?success=updated`);
}
