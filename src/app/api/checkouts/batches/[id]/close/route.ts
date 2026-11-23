import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {revalidatePath} from 'next/cache';
import {getSessionProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {isUUID} from '@/lib/checkout-inspection';
import {checkoutBatchPdf} from '@/lib/checkout-batch-pdf';
import {batchSummary,type BatchSnapshot} from '@/lib/checkout-batches';
import {loadCheckoutBatch} from '@/lib/checkout-batches.server';
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const profile=await getSessionProfile();if(!profile||!['admin','management_viewer'].includes(profile.role))return NextResponse.json({error:'Access denied'},{status:403});
 const {id}=await params;if(!isUUID(id))return NextResponse.json({error:'Invalid batch'},{status:400});
 try{const snap=await loadCheckoutBatch(await createClient(),id);const stats=batchSummary(snap);return NextResponse.json({...stats,state:snap.batch.state,batchNo:snap.batch.batch_no,unfinished:snap.rooms.filter(r=>!r.deleted_at&&r.status!=='ready_for_occupancy').map(r=>({room:r.block+' '+r.room_no,status:r.status})),pending:snap.requests.filter(r=>['pending','approved'].includes(String(r.status))).map(r=>({number:r.request_no,id:r.id}))},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to load batch'},{status:400});}
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const profile=await getSessionProfile();if(!profile||profile.role!=='admin')return NextResponse.json({error:'Administrator access required'},{status:403});
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Invalid request origin'},{status:403});
 const {id}=await params;if(!isUUID(id))return NextResponse.json({error:'Invalid batch'},{status:400});
 const db=await createClient();
 try{
  const input=await req.json();if(typeof input.closeUnissued!=='boolean'||typeof input.note!=='string'||input.note.length>2000)return NextResponse.json({error:'Invalid closing details'},{status:400});
  const {data,error}=await db.rpc('prepare_checkout_batch_close',{p_batch_id:id,p_close_unissued:input.closeUnissued,p_note:input.note});if(error)throw new Error(error.message);
  const snapshot=data as BatchSnapshot;
  const {data:current,error:batchError}=await db.from('checkout_batches').select('state').eq('id',id).single();if(batchError)throw new Error(batchError.message);if(current.state==='closed')return NextResponse.json({ok:true,href:'/admin/checkouts/batches/'+id});
  // Embed every saved photo. Bounded parallel decoding preserves original files and
  // keeps each A4 photo sharp while respecting the Documents 50 MB upload limit.
  const paths=[...new Set(snapshot.photos.map(p=>String(p.storage_path)))],signed=new Map<string,string>(),images=new Map<string,Uint8Array>();
  for(let start=0;start<paths.length;start+=100){const result=await db.storage.from('checkout-evidence').createSignedUrls(paths.slice(start,start+100),3600);if(result.error)throw new Error('Unable to access batch photos. Please retry.');for(const row of result.data||[])if(row.path&&row.signedUrl&&!row.error)signed.set(row.path,row.signedUrl);}
  let next=0;await Promise.all(Array.from({length:Math.min(8,paths.length)},async()=>{while(next<paths.length){const path=paths[next++],url=signed.get(path);if(!url)throw new Error('A saved photo is unavailable: '+path+'. Restore it before retrying End Batch.');const response=await fetch(url,{signal:AbortSignal.timeout(30_000)});if(!response.ok)throw new Error('Unable to download a saved photo. Retry End Batch.');const jpg=await sharp(Buffer.from(await response.arrayBuffer())).rotate().resize({width:1100,height:1100,fit:'inside',withoutEnlargement:true}).jpeg({quality:72}).toBuffer();images.set(path,jpg);}}));
  // Keep the complete photo appendix inside the Documents size limit. Originals
  // remain unchanged; only the embedded A4 images are recompressed if needed.
  const imageBytes=()=>[...images.values()].reduce((n,b)=>n+b.byteLength,0);
  for(const [edge,quality] of [[1000,62],[900,54],[800,48]] as const){
   if(imageBytes()<=42*1024*1024)break;
   let cursor=0;await Promise.all(Array.from({length:Math.min(4,paths.length)},async()=>{while(cursor<paths.length){const path=paths[cursor++],original=images.get(path)!;const smaller=await sharp(original).resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).jpeg({quality}).toBuffer();if(smaller.byteLength<original.byteLength)images.set(path,smaller);}}));
  }
  const summary=await checkoutBatchPdf(snapshot,'summary');
  const details=await checkoutBatchPdf(snapshot,'details',async p=>{const bytes=images.get(String(p.storage_path));if(!bytes)throw new Error('Missing photo; full report cannot be completed');return bytes;});
  if(details.length>50*1024*1024)throw new Error('The full report exceeds the Documents 50 MB limit. The batch is preserved; please contact Admin to split its photo appendix.');
  const run=randomUUID(),summaryPath=`${profile.id}/${snapshot.batch.summary_document_id}/summary-${run}.pdf`,detailsPath=`${profile.id}/${snapshot.batch.details_document_id}/details-${run}.pdf`;
  for(const [path,bytes]of [[summaryPath,summary],[detailsPath,details]] as const){const upload=await db.storage.from('system-documents').upload(path,bytes,{contentType:'application/pdf',upsert:false});if(upload.error)throw new Error('Report upload failed. Retry End Batch; your records are preserved.');}
  const result=await db.rpc('finish_checkout_batch_close',{p_batch_id:id,p_summary_path:summaryPath,p_details_path:detailsPath});if(result.error)throw new Error(result.error.message);
  revalidatePath('/admin/checkouts');revalidatePath('/documents');revalidatePath('/documents/check-out-batches');revalidatePath('/staff/checkouts');
  return NextResponse.json({ok:true,href:'/admin/checkouts/batches/'+id});
 }catch(e){console.error('Check-out batch close failed',e instanceof Error?e.message:'Unknown error');return NextResponse.json({error:e instanceof Error?e.message:'Unable to generate reports. Retry End Batch.'},{status:409});}
}
