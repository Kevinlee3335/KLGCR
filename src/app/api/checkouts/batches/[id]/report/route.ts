import {NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {isUUID} from '@/lib/checkout-inspection';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const profile=await getSessionProfile();if(!profile||!['admin','management_viewer'].includes(profile.role))return new NextResponse('Access denied',{status:403});
 const {id}=await params;if(!isUUID(id))return new NextResponse('Invalid batch',{status:400});
 const q=new URL(req.url).searchParams,kind=q.get('kind');if(!['summary','details'].includes(kind||''))return new NextResponse('Invalid report',{status:400});
 const db=await createClient();const {data:batch,error}=await db.from('checkout_batches').select('state,summary_document_id,details_document_id').eq('id',id).single();
 if(error||!batch||batch.state!=='closed')return new NextResponse('Batch reports are not ready',{status:404});
 const {data:doc}=await db.from('system_documents').select('storage_path,file_name').eq('id',kind==='summary'?batch.summary_document_id:batch.details_document_id).single();if(!doc)return new NextResponse('Report not found',{status:404});
 const signed=await db.storage.from('system-documents').createSignedUrl(doc.storage_path,300,q.get('preview')==='1'?undefined:{download:doc.file_name});if(signed.error)return new NextResponse('Unable to open report',{status:503});
 const response=NextResponse.redirect(signed.data.signedUrl);response.headers.set('Cache-Control','private, no-store');return response;
}
