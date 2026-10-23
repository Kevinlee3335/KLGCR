"use server";
import {revalidatePath} from 'next/cache';
import {requireRole} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {membershipEnabled} from '@/lib/membership';
export async function saveReceiptNumber(form:FormData):Promise<{success?:boolean;value?:string;error?:string}>{
 const profile=await requireRole(['admin']);
 if(!membershipEnabled())return {error:'Membership is not enabled.'};
 const id=String(form.get('ledger')||''),value=String(form.get('receipt')||'').trim(),expected=String(form.get('expected')||'');
 if(!/^[a-f0-9-]{36}$/.test(id)||value.length>100||/[\u0000-\u001f\u007f]/.test(value))return {error:'Enter a receipt number up to 100 characters.'};
 const {error}=await createAdminClient().rpc('set_membership_payment_receipt',{p_ledger:id,p_actor:profile.id,p_receipt:value,p_expected:expected});
 if(error)return {error:error.message?.includes('changed')?'This number was changed by another Admin. Refresh and check before saving.':'Unable to save. Please try again.'};
 revalidatePath('/admin/members/payment-list');
 return {success:true,value};
}

export async function deletePaymentListEntry(form:FormData):Promise<{success?:boolean;error?:string}>{
 const profile=await requireRole(['admin']);
 if(!membershipEnabled())return {error:'Membership is not enabled.'};
 const id=String(form.get('ledger')||'');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return {error:'Invalid payment entry.'};
 const {error}=await createAdminClient().rpc('delete_membership_payment_list_entry',{p_ledger:id,p_actor:profile.id});
 if(error)return {error:'Unable to delete. Please try again.'};
 revalidatePath('/admin/members/payment-list');
 revalidatePath('/admin/members/committee-reports');
 return {success:true};
}
