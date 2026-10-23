import 'server-only';
import {createAdminClient} from './supabase/admin';
import {malaysiaDay} from './membership';
import {buildMembershipMaster,decodeMasterLayout,type MasterMember,type MasterPayment} from './membership-master';
export async function loadMembershipMaster(){
 const db=createAdminClient();
 const {data:source,error}=await db.from('membership_master_templates').select('workbook_base64,layout,sha256').eq('id','gym-master-v1').eq('ready',true).single();
 if(error||!source?.layout)throw new Error('Unable to load the original membership workbook.');
 const members:MasterMember[]=[],payments:MasterPayment[]=[],deleted=new Set<string>();
 for(let offset=0;;offset+=500){const {data,error}=await db.from('memberships').select('id,full_name,room_no,member_number,member_type,status,starts_on,expires_on,created_at').order('id').range(offset,offset+499);if(error)throw new Error('Unable to load members.');members.push(...data);if(data.length<500)break;}
 for(let offset=0;;offset+=500){const {data,error}=await db.from('membership_payment_ledger').select('id,payment_id').not('deleted_at','is',null).order('id').range(offset,offset+499);if(error)throw new Error('Unable to check deleted payments.');for(const row of data)if(row.payment_id)deleted.add(row.payment_id);if(data.length<500)break;}
 for(let offset=0;;offset+=500){const {data,error}=await db.from('membership_payments').select('id,member_id,period_start,amount,kind').eq('status','approved').order('id').range(offset,offset+499);if(error)throw new Error('Unable to load approved payments.');payments.push(...data.filter(p=>!deleted.has(p.id)));if(data.length<500)break;}
 const result=buildMembershipMaster(decodeMasterLayout(source.layout),members,payments,malaysiaDay());
 return {result,bytes:Buffer.from(source.workbook_base64,'base64')};
}
