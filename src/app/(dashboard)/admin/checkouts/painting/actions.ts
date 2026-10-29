'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireRole} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
export async function updatePainting(form:FormData){
 await requireRole(['admin']);const db=await createClient();
 const {error}=await db.rpc('update_checkout_painting',{p_defect_id:String(form.get('defect')||''),p_worker:String(form.get('worker')||''),p_status:String(form.get('status')||''),p_notes:String(form.get('notes')||'')});
 if(error)redirect(`/admin/checkouts/painting?error=${encodeURIComponent(error.message)}`);
 revalidatePath('/admin/checkouts/painting');revalidatePath('/admin/checkouts','layout');redirect('/admin/checkouts/painting?success=1');
}
