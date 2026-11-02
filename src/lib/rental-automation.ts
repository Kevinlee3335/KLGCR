import {createAdminClient} from './supabase/admin';
import {configSchema,makeSnapshot,malaysiaClock,scheduleDecision,type BillingConfig} from './billing-preview';
import {companyHolidays} from './company-holidays';

export function automaticRentalDecision(config:BillingConfig,clock:{date:string;time:string}){
 const year=Number(clock.date.slice(0,4));
 const holidays=[...new Set([...config.holidays,...[year-1,year].flatMap(companyHolidays).map(h=>h.date)])];
 return scheduleDecision({...config,holidays,reviewedUntil:year+'-12-31'},clock);
}

// A saved monthly pack enters the normal Fikri -> Kevin -> James review queue.
// The unique (kind, period) constraint makes concurrent cron/dashboard retries safe.
export async function ensureDueRentalInvoice(clock=malaysiaClock()){
 const db=createAdminClient();
 const settings=await db.from('billing_preview_settings').select('config').eq('id',1).single();
 if(settings.error)throw Error('Unable to load the rental schedule');
 const config=configSchema.parse(settings.data.config);
 const decision=automaticRentalDecision(config,clock);
 if(decision.status!=='ready')return {status:decision.status};
 const existing=await db.from('billing_preview_runs').select('id').eq('kind','rental').eq('period',decision.period).maybeSingle();
 if(existing.error)throw Error('Unable to check monthly rental invoices');
 if(existing.data)return {status:'exists',id:existing.data.id};
 const snapshot=makeSnapshot('rental',decision.period,decision.due,config,'Automatic monthly rental');
 if(!snapshot.lines.length)return {status:'no_active_tenancies'};
 const owner=await db.from('profiles').select('id').eq('username','kevinlee3335').eq('role','admin').eq('is_active',true).single();
 if(owner.error)throw Error('Rental automation owner unavailable');
 const saved=await db.from('billing_preview_runs').insert({kind:'rental',period:decision.period,issue_date:decision.due,total:snapshot.total,snapshot,created_by:owner.data.id}).select('id').single();
 if(saved.error?.code==='23505')return {status:'exists'};
 if(saved.error)throw Error('Unable to save automatic rental invoices');
 return {status:'created',id:saved.data.id};
}
