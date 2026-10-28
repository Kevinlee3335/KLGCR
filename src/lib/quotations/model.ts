import type {Signature} from '@/lib/purchase-orders/signature';
import { z } from 'zod';

const text = z.string().max(2000);
export const quotationInput = z.object({
  date: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s),
  customer: text.trim().min(1), address: text, attention: text, phone: text, email: text,
  salutation: text, introduction: text, note: text, paymentTerms: text, paymentMethod: text, validity: text,
  quantityHeading: text,
  items: z.array(z.object({ description: text.trim().min(1), quantity: z.number().positive().max(1000000), unit: z.string().max(30), price: z.number().nonnegative().max(1000000) })).min(1).max(100),
});
export type QuotationInput = z.infer<typeof quotationInput>;
export type Quotation = QuotationInput & { id: string; number: string; createdBy: string; createdAt: string; preparedSignature?:Signature; approvedSignature?:Signature; approvedBy?:string; approvedAt?:string };
export const customerInput = quotationInput.pick({customer:true,address:true,attention:true,phone:true,email:true});
export type Customer = z.infer<typeof customerInput> & {id:string};
export type Registry = { revision: number; counters: Record<string, number>; quotes: Quotation[]; customers?:Customer[] };
const customerKey=(name:string)=>name.trim().replace(/\s+/g,' ').toLowerCase();
export function customerDirectory(registry:Registry):Customer[]{
 if(registry.customers)return [...registry.customers].sort((a,b)=>a.customer.localeCompare(b.customer));
 const customers:Customer[]=[];
 for(const q of [...registry.quotes].reverse()){
  const data=customerInput.parse(q),index=customers.findIndex(c=>customerKey(c.customer)===customerKey(q.customer));
  if(index>=0)customers[index]={...data,id:customers[index].id};else customers.push({...data,id:'customer-'+q.id});
 }
 return customers.sort((a,b)=>a.customer.localeCompare(b.customer));
}
export function saveCustomer(registry:Registry,data:z.infer<typeof customerInput>,id:string):Registry{
 const customers=customerDirectory(registry),index=customers.findIndex(c=>c.id===id||customerKey(c.customer)===customerKey(data.customer));
 const customer={...data,customer:data.customer.trim(),id:index>=0?customers[index].id:id};
 if(index>=0)customers[index]=customer;else customers.push(customer);
 return {...registry,revision:registry.revision+1,customers};
}
export const lineAmount = (item: QuotationInput['items'][number]) => Math.round((item.quantity * item.price + Number.EPSILON) * 100) / 100;
export const totalAmount = (q: QuotationInput) => Math.round(q.items.reduce((n, i) => n + lineAmount(i), 0) * 100) / 100;
export function blankQuotation(): QuotationInput {
  return { date: new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()), customer:'', address:'', attention:'', phone:'', email:'', salutation:'', introduction:'We are pleased to append below our quotation for your kind perusal :', quantityHeading:'QUANTITY', note:'', paymentTerms:'', paymentMethod:'Alliance Bank (ACC : 011030018195636) or payment by cheque to be made payable to K Hotel Sdn Bhd', validity:'', items:[{description:'',quantity:1,unit:'',price:0}] };
}
export function initialRegistry(): Registry {
  return {revision:0,counters:{'2026-10':1},quotes:[{...blankQuotation(),id:'original-2610-0001',number:'2610-0001',date:'2026-10-10',customer:'UTMSPACE',address:'ARAS 4 & 5, BLOK T05,\nUNIVERSITI TEKNOLOGI MALAYSIA,\n81310 JOHOR BAHRU, JOHOR MALAYSIA',attention:'MS NORAIN SAMSUDIN',phone:'+6012-7971067',email:'nrain@utmspace.edu.my',salutation:'Dear Ms Norain Samsudin,',introduction:'We are pleased to append below our access card rate for your kind perusal :',quantityHeading:'NO OF ACCESS CARD',items:[{description:'Access Card',quantity:40,unit:'PIECES',price:25}],note:'Note: For replacement of lost of acces card, the charges will be RM 25.00 per card',paymentTerms:'Payment to be made within Two (2) Weeks after 10th October 2026',validity:'Please be advised that this quotation is valid until 24th October 2026',createdBy:'Imported from original Excel',createdAt:'2026-10-10T00:00:00.000Z'}]};
}
export function appendQuotation(registry: Registry, input: QuotationInput, id: string, createdBy: string): Registry {
  if(registry.quotes.some(q=>q.id===id))return registry;
  const period=input.date.slice(0,7), next=(registry.counters[period]??0)+1;
  if(next>9999)throw Error('Monthly quotation number limit reached');
  const number=period.slice(2).replace('-','')+'-'+String(next).padStart(4,'0');
  const withCustomer=saveCustomer(registry,customerInput.parse(input),'customer-'+id);
  return {...withCustomer,counters:{...registry.counters,[period]:next},quotes:[{...input,id,number,createdBy,createdAt:new Date().toISOString()},...registry.quotes]};
}
