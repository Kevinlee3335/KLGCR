import { z } from 'zod';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUnifiReceipt, unifiReceiptBucket } from '@/lib/unifi-receipts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const profile=await getSessionProfile();
  if (!profile || !['admin','management_viewer'].includes(profile.role)) return new Response('Forbidden',{status:403});
  const {id}=await params;if(!z.string().uuid().safeParse(id).success)return new Response('Not found',{status:404});
  try {
    const receipt=await getUnifiReceipt(id);if(!receipt)return new Response('Not found',{status:404});
    const selected=new URL(request.url).searchParams.get('file');
    const email=selected==='email';
    const file=!email && selected && /^\d+$/.test(selected) ? receipt.attachments[Number(selected)] : null;
    if(!email&&!file)return new Response('Not found',{status:404});
    const path=email?receipt.email_path:file!.storage_path;
    const result=await createAdminClient().storage.from(unifiReceiptBucket).download(path);
    if(result.error||!result.data)return new Response('File unavailable',{status:503});
    const name=(email?`Unifi-receipt-${id}.eml`:file!.name).replace(/[^a-z0-9._-]/gi,'_').slice(0,180);
    return new Response(await result.data.arrayBuffer(),{headers:{'Content-Type':email?'message/rfc822':file!.mime_type,
      'Content-Disposition':`${email?'attachment':'inline'}; filename="${name}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"frame-ancestors 'self'"}});
  }catch{return new Response('Unable to read receipt file',{status:503});}
}
