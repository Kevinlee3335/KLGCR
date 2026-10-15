import {createHash,randomBytes} from 'node:crypto';
import {configSchema,isBlocked,nextBillingDay,monthSchema,daySchema,type BillingConfig} from './billing-preview';
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export const newDeviceToken=()=>randomBytes(32).toString('base64url');
export function rentalPeriodsDue(config:BillingConfig,from:string,clock:{date:string;time:string}){
 daySchema.parse(clock.date);monthSchema.parse(from);
 if(!config.enabled||!config.reviewedUntil||clock.date>config.reviewedUntil||isBlocked(clock.date,config.holidays)||clock.time<config.time)return [];
 const first=from>config.startPeriod?from:config.startPeriod,last=clock.date.slice(0,7),out:string[]=[];
 // Bound stale setup errors; an administrator can review earlier periods manually.
 if(first>last)return out;
 const d=new Date(first+'-01T00:00:00Z');
 for(let n=0;n<120;n++){const period=d.toISOString().slice(0,7);if(period>last)break;if(nextBillingDay(period,config.holidays)<=clock.date)out.push(period);d.setUTCMonth(d.getUTCMonth()+1)}
 return out;
}
export function parsePrintConfig(raw:unknown){return configSchema.parse(raw)}
