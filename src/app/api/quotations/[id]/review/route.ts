import {NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {quotationPrintHtml} from '@/lib/quotations/print';
import type {Registry} from '@/lib/quotations/model';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const profile=await getSessionProfile();
 if(!profile||!['admin','management_viewer'].includes(profile.role))return new NextResponse('Access denied',{status:403});
 const {id}=await params;
 const db=await createClient(),result=await db.from('quotation_registry').select('value').eq('id',1).maybeSingle();
 if(result.error)return new NextResponse('Unable to load quotation',{status:503});
 const quote=(result.data?.value as Registry|undefined)?.quotes.find(q=>q.id===id);
 if(!quote)return new NextResponse('Quotation not found',{status:404});
 return new NextResponse(quotationPrintHtml(quote),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN'}});
}
