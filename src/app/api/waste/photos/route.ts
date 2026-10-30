import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { securityAccess } from '@/lib/waste/server';
import { WASTE_BUCKET } from '@/lib/waste/shared';
export async function POST(request: Request) {
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Invalid request origin.'},{status:403});
 const access=await securityAccess();
 if(!access)return NextResponse.json({error:'Please reopen your Security link.'},{status:401});
 try {
  const {requestId,count}=await request.json();
  if(!/^[a-f0-9-]{36}$/.test(requestId)||!Number.isInteger(count)||count<1||count>20)throw Error('Attach between 1 and 20 photos.');
  const db=createAdminClient(),uploads=[];
  for(let i=0;i<count;i++){
   const path=`photos/${access.id}/${requestId}/${crypto.randomUUID()}.jpg`;
   const {data,error}=await db.storage.from(WASTE_BUCKET).createSignedUploadUrl(path);
   if(error||!data)throw Error('Unable to prepare photos.');
   uploads.push({path,token:data.token,signedUrl:data.signedUrl});
  }
  return NextResponse.json({uploads});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to prepare photos.'},{status:400});}
}
