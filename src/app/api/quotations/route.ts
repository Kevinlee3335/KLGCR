import {NextRequest,NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {appendQuotation,customerDirectory,customerInput,saveCustomer,quotationInput} from '@/lib/quotations/model';
import {loadQuotationRegistry} from '@/lib/quotations/registry';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function authorized(){const p=await getSessionProfile();return p&&['admin','management_viewer'].includes(p.role)?p:null}
export async function GET(){if(!await authorized())return reply({error:'Access denied'},403);try{const registry=await loadQuotationRegistry();return reply({...registry,customers:customerDirectory(registry)})}catch{return reply({error:'Unable to load quotations. Please try again.'},503)}}
export async function POST(req:NextRequest){
 const p=await authorized();if(!p)return reply({error:'Access denied'},403);
 if(req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'Invalid origin'},403);
 const raw=await req.text();if(Buffer.byteLength(raw)>250000)return reply({error:'Quotation too large'},413);
 try{
  const body=JSON.parse(raw);
  if(body.action==='approve'){
   if(p.role!=='admin')return reply({error:'Administrator approval required'},403);
   const {id}=z.object({id:z.string().uuid()}).parse(body),db=await createClient();
   const signature=await db.from('user_e_signatures').select('signature').eq('user_id',p.id).single();
   if(signature.error||!signature.data)return reply({error:'Save your e-signature first'},409);
   for(let attempt=0;attempt<5;attempt++){
    const registry=await loadQuotationRegistry(),quote=registry.quotes.find(q=>q.id===id);
    if(!quote)return reply({error:'Quotation not found'},404);
    if(quote.approvedAt)return reply({quote});
    const signed={...quote,approvedBy:p.full_name,approvedAt:new Date().toISOString(),approvedSignature:signature.data.signature};
    const next={...registry,revision:registry.revision+1,quotes:registry.quotes.map(q=>q.id===id?signed:q)};
    const result=await db.from('quotation_registry').update({value:next,updated_at:new Date().toISOString()}).eq('id',1).eq('value->>revision',String(registry.revision)).select('id').maybeSingle();
    if(result.error)throw Error('Unable to approve quotation');if(result.data)return reply({quote:signed});
   }
   return reply({error:'Quotation changed. Refresh and retry.'},409);
  }
  if(body.action==='saveCustomer'){
   const {customer,id}=z.object({customer:customerInput,id:z.string().min(1).max(150)}).parse(body);
   const db=await createClient();
   for(let attempt=0;attempt<5;attempt++){
    const registry=await loadQuotationRegistry(),next=saveCustomer(registry,customer,id);
    const result=await db.from('quotation_registry').update({value:next,updated_at:new Date().toISOString()}).eq('id',1).eq('value->>revision',String(registry.revision)).select('id').maybeSingle();
    if(result.error)throw Error('Unable to save customer');
    if(result.data)return reply({customers:customerDirectory(next)});
   }
   return reply({error:'Customer could not be saved. Please retry.'},409);
  }
  const {input,id}=z.object({input:quotationInput,id:z.string().uuid()}).parse(body);
  const db=await createClient();
  for(let attempt=0;attempt<5;attempt++){
   const registry=await loadQuotationRegistry(),existing=registry.quotes.find(q=>q.id===id);
   if(existing)return reply({quote:existing});
   const signature=await db.from('user_e_signatures').select('signature').eq('user_id',p.id).single();
   if(signature.error||!signature.data)return reply({error:'Save your e-signature before preparing a quotation'},409);
   const next=appendQuotation(registry,input,id,p.full_name);
   next.quotes[0]={...next.quotes[0],preparedSignature:signature.data.signature};
   const result=await db.from('quotation_registry').update({value:next,updated_at:new Date().toISOString()}).eq('id',1).eq('value->>revision',String(registry.revision)).select('id').maybeSingle();
   if(result.error)throw Error('Unable to save quotation');
   if(result.data)return reply({quote:next.quotes[0]});
  }
  return reply({error:'Another quotation is being saved. Please try again.'},409);
 }catch(e){return reply({error:e instanceof z.ZodError?'Please check the customer, date and item details.':'Unable to save quotation. Please try again.'},400)}
}
