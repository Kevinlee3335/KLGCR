import {createClient} from './supabase/server';
import type {BillingDocumentKind,BillingDocumentRecord,BillingAccountDirectory} from './billing-documents';
export async function loadBillingDocumentRecords(kind:BillingDocumentKind,accountKey?:string):Promise<BillingDocumentRecord[]>{
 const db=await createClient(),rows:BillingDocumentRecord[]=[];
 for(let offset=0;;offset+=1000){
  let query=db.from('billing_document_index').select('run_id,line_index,kind,period,issue_date,created_at,account_key,account_name,bill_no,amount,description,approved_at,approved_by').eq('kind',kind);
  if(accountKey!==undefined)query=query.eq('account_key',accountKey);
  const result=await query.order('period',{ascending:false}).order('issue_date',{ascending:false}).order('created_at',{ascending:false}).order('run_id').order('line_index').range(offset,offset+999);
  if(result.error)throw Error('Unable to load saved billing documents');rows.push(...(result.data||[]));if(!result.data||result.data.length<1000)break;
 }
 return rows;
}
export async function loadBillingAccountDirectory(kind:BillingDocumentKind):Promise<BillingAccountDirectory[]>{
 const db=await createClient();const result=await db.from('billing_account_directory').select('kind,account_key,account_name,detail').eq('kind',kind);
 if(result.error)throw Error('Unable to load billing account folders');return result.data||[];
}
