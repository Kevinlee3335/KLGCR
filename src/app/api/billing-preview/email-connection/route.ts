import {NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth';
import {billingPreviewEnabled} from '@/lib/billing-preview';
import {billingMailConnection} from '@/lib/billing-mail';
export async function GET(){const p=await getSessionProfile();if(!billingPreviewEnabled()||p?.role!=='admin')return NextResponse.json({error:'Administrator access required'},{status:403});return NextResponse.json(await billingMailConnection(),{headers:{'Cache-Control':'no-store'}});}
