import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { classifyAttachment, inImportRange, mailbox, supplierForSender } from '@/lib/supplier-mail/rules';
export const runtime = 'nodejs';
const messageId = z.string().regex(/^[0-9a-f]{10,40}$/);
const fileSchema = z.object({ partId: z.string().regex(/^[0-9.]{1,80}$/), filename: z.string().min(1).max(255), hash: z.string().regex(/^[0-9a-f]{64}$/), size: z.number().int().min(1).max(50 * 1024 * 1024) });
const inputSchema = z.discriminatedUnion('op', [
  z.object({op:z.literal('message'), mailbox:z.literal(mailbox), id:messageId, sender:z.string().max(512), subject:z.string().max(2000), body:z.string().max(200000), receivedAt:z.string().datetime({offset:true})}),
  z.object({op:z.enum(['prepare','complete']), id:messageId, file:fileSchema}),
  z.object({op:z.literal('issue'), id:messageId, partId:z.string().regex(/^[0-9.]{1,80}$/), filename:z.string().min(1).max(255), issue:z.string().min(1).max(500)}),
]);
export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return NextResponse.json({error:'Unauthorized'},{status:401});
  const db = createAdminClient();
  const hash = createHash('sha256').update(token).digest('hex');
  const connection = await db.from('supplier_mail_connections').select('id').eq('token_hash',hash).is('revoked_at',null).maybeSingle();
  if (connection.error || !connection.data) return NextResponse.json({error:'Unauthorized'},{status:401});
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 300000) return NextResponse.json({error:'Request too large'},{status:413});
  let input: z.infer<typeof inputSchema>;
  try { input = inputSchema.parse(JSON.parse(raw)); } catch { return NextResponse.json({error:'Invalid input'},{status:400}); }
  try {
    if (input.op === 'message') {
      const company = supplierForSender(input.sender);
      if (!company || !inImportRange(input.receivedAt)) return NextResponse.json({error:'Outside approved supplier/date scope'},{status:400});
      const result = await db.from('supplier_emails').upsert({id:input.id,company,sender:input.sender,subject:input.subject,body_text:input.body,received_at:input.receivedAt},{onConflict:'id',ignoreDuplicates:true});
      if (result.error) throw result.error;
      const heartbeat = await db.from('supplier_mail_connections').update({last_received_at:new Date().toISOString()}).eq('id',connection.data.id);
      if (heartbeat.error) throw heartbeat.error;
      return NextResponse.json({ok:true});
    }
    const result = await db.from('supplier_emails').select('company,subject').eq('id',input.id).single();
    if (result.error || !result.data) return NextResponse.json({error:'Import parent email first'},{status:400});
    const email = result.data;
    if (input.op === 'issue') {
      const saved = await db.from('supplier_mail_attachments').upsert({message_id:input.id,part_id:input.partId,file_name:input.filename,issue:input.issue},{onConflict:'message_id,part_id',ignoreDuplicates:true});
      if (saved.error) throw saved.error;
      return NextResponse.json({ok:true});
    }
    const file = input.file;
    if (!/\.pdf$/i.test(file.filename)) return NextResponse.json({error:'PDF files only'},{status:400});
    const storagePath = `${email.company}/${file.hash}.pdf`;
    const existing = await db.from('supplier_mail_documents').select('id').eq('company',email.company).eq('content_hash',file.hash).maybeSingle();
    if (existing.error) throw existing.error;
    let documentId = existing.data?.id;
    if (input.op === 'prepare' && !documentId) {
      // Retried uploads may already exist after an interrupted finalization.
      const listed = await db.storage.from('supplier-mail').list(email.company,{search:`${file.hash}.pdf`,limit:1});
      if (listed.error) throw listed.error;
      if (listed.data.some(row=>row.name===`${file.hash}.pdf`)) return NextResponse.json({needsComplete:true});
      const upload = await db.storage.from('supplier-mail').createSignedUploadUrl(storagePath);
      if (upload.error) throw upload.error;
      return NextResponse.json({uploadUrl:upload.data.signedUrl});
    }
    if (!documentId) {
      const downloaded = await db.storage.from('supplier-mail').download(storagePath);
      if (downloaded.error) throw downloaded.error;
      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      if (bytes.length !== file.size || bytes.subarray(0,1024).indexOf('%PDF-') < 0 || createHash('sha256').update(bytes).digest('hex') !== file.hash) return NextResponse.json({error:'PDF verification failed'},{status:400});
      const saved = await db.from('supplier_mail_documents').upsert({company:email.company,content_hash:file.hash,file_name:file.filename,folder:classifyAttachment(file.filename,email.subject),storage_path:storagePath,size_bytes:file.size},{onConflict:'company,content_hash',ignoreDuplicates:true});
      if (saved.error) throw saved.error;
      const doc = await db.from('supplier_mail_documents').select('id').eq('company',email.company).eq('content_hash',file.hash).single();
      if (doc.error) throw doc.error;
      documentId = doc.data.id;
    }
    const linked = await db.from('supplier_mail_attachments').upsert({message_id:input.id,part_id:file.partId,file_name:file.filename,document_id:documentId,issue:null},{onConflict:'message_id,part_id'});
    if (linked.error) throw linked.error;
    return NextResponse.json({ok:true,done:true});
  } catch (error) {
    console.error('Supplier archive ingest failed', error instanceof Error ? error.name : 'storage/database error');
    return NextResponse.json({error:'Archive failed; retry without advancing the sync cursor.'},{status:500});
  }
}
