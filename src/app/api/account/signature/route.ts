import {NextRequest,NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {signatureSchema} from '@/lib/purchase-orders/signature';
export async function GET(){
 const p=await getSessionProfile();if(!p)return NextResponse.json({error:'Sign in required'},{status:401});
 const db=await createClient();const {data,error}=await db.from('user_e_signatures').select('signature,updated_at').eq('user_id',p.id).maybeSingle();
 if(error)return NextResponse.json({error:'Unable to load signature'},{status:503});return NextResponse.json({signature:data?.signature||null});
}
export async function POST(req:NextRequest){
 const p=await getSessionProfile();if(!p)return NextResponse.json({error:'Sign in required'},{status:401});
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 try{const raw=await req.text();if(raw.length>200000)return NextResponse.json({error:'Signature too large'},{status:413});const parsed=signatureSchema.safeParse(JSON.parse(raw));if(!parsed.success)return NextResponse.json({error:'Please draw your signature again.'},{status:400});
 const db=await createClient();const {error}=await db.from('user_e_signatures').upsert({user_id:p.id,signature:parsed.data});
 if(error)return NextResponse.json({error:'Unable to save signature'},{status:503});return NextResponse.json({ok:true,signature:parsed.data});
 }catch{return NextResponse.json({error:'Unable to save signature'},{status:400});}
}
