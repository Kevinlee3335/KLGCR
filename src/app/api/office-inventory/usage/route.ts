import {NextRequest,NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {officeUsageInput} from '@/lib/office-inventory/model';
export async function POST(req:NextRequest){
 const profile=await getSessionProfile();
 if(!profile||!['admin','maintenance_staff','cleaner'].includes(profile.role))return NextResponse.json({error:'Employee access required'},{status:403});
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 try{
  const raw=await req.text();if(raw.length>5000)return NextResponse.json({error:'Submission too large'},{status:413});
  const parsed=officeUsageInput.safeParse(JSON.parse(raw));if(!parsed.success)return NextResponse.json({error:'Enter the person taking supplies, an item and a valid quantity.'},{status:400});
  const v=parsed.data,db=await createClient();
  const result=await db.rpc('take_office_inventory',{p_request_id:v.requestId,p_item_id:v.itemId,p_qty:v.quantity,p_taken_by:v.takenBy,p_note:v.note});
  if(result.error){const allowed=['Not enough stock available','Office item is unavailable','Ask Admin to confirm the stock quantity and unit first','This submission was already recorded; start a new entry'];return NextResponse.json({error:allowed.includes(result.error.message)?result.error.message:'Unable to record supplies. Check your entry and try again.'},{status:409});}
  return NextResponse.json({usage:result.data},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Unable to record supplies. Please retry.'},{status:400});}
}
