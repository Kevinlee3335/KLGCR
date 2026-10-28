import {z} from 'zod';
export const officeUsageInput=z.object({requestId:z.string().uuid(),itemId:z.string().uuid(),quantity:z.number().finite().positive().max(1000000).refine(n=>Math.abs(n*100-Math.round(n*100))<0.000001),takenBy:z.string().trim().min(1).max(100),note:z.string().trim().max(500).default('')});
export type OfficeItem={id:string;item_code:string;description:string;unit:string|null;balance_qty:number|string;quantity_unverified:boolean};
export type OfficeUsage={id:string;item_code:string;description:string;unit:string|null;taken_by_name:string;recorded_by_name:string;qty:number|string;balance_before:number|string;balance_after:number|string;note:string;taken_at:string};
