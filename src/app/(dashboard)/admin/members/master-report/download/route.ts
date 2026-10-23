import {requireRole} from '@/lib/auth';
import {membershipEnabled} from '@/lib/membership';
import {loadMembershipMaster} from '@/lib/membership-master-data';
import {exportMembershipMaster} from '@/lib/membership-master';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(){
 await requireRole(['admin']);if(!membershipEnabled())return new Response('Not available',{status:404});
 try{const {result,bytes}=await loadMembershipMaster();const output=exportMembershipMaster(bytes,result);return new Response(new Uint8Array(output),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="KLGCR-Membership-Master.xlsx"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch{return new Response('Unable to generate the report. Please refresh and try again.',{status:500});}
}
