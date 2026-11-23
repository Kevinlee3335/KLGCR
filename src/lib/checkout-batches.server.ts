import type {SupabaseClient} from '@supabase/supabase-js';
import type {BatchRecord,BatchSnapshot} from './checkout-batches';
export const batchColumns='id,batch_no,name,state,started_at,closed_at,closing_note,summary_document_id,details_document_id';
export async function activeCheckoutBatch(db:SupabaseClient){const {data,error}=await db.from('checkout_batches').select(batchColumns).in('state',['active','closing']).maybeSingle();if(error)throw new Error(error.message);return data as BatchRecord|null;}
export async function loadCheckoutBatch(db:SupabaseClient,id:string){const {data,error}=await db.rpc('checkout_batch_snapshot',{p_batch_id:id});if(error)throw new Error(error.message);return data as BatchSnapshot;}
