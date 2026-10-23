import {requireRole} from "@/lib/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {membershipEnabled} from "@/lib/membership";
import {paymentListRange,renderPaymentList,validPaymentListMonth,type PaymentListRow} from "@/lib/membership-payment-list";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{month:string}>}){
 await requireRole(["admin"]);
 if(!membershipEnabled())return new Response('Not available',{status:404});
 const {month}=await params;if(!validPaymentListMonth(month))return new Response('Invalid month',{status:400});
 const {start,end}=paymentListRange(month),db=createAdminClient();
 const rows:PaymentListRow[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from('membership_payment_ledger').select('id,collected_on,full_name,member_reference,member_type,source,approved_at,amount,receipt_no').is('deleted_at',null).gte('collected_on',start).lt('collected_on',end).order('collected_on').order('approved_at',{nullsFirst:true}).order('source_row',{nullsFirst:false}).order('id').range(offset,offset+499);
  if(error)return new Response('Unable to load this month',{status:500});rows.push(...data);if(data.length<500)break;
 }
 return new Response(renderPaymentList(month,rows),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
