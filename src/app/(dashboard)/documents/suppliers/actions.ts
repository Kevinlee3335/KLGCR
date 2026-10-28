'use server';
import { createHash, randomBytes } from 'node:crypto';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
export async function prepareSupplierConnection() {
  const profile = await requireRole(['admin']);
  const token = randomBytes(32).toString('hex');
  const db = createAdminClient();
  // Each setup is independent. Do not revoke a working sync during setup/retries.
  const saved = await db.from('supplier_mail_connections').insert({token_hash:createHash('sha256').update(token).digest('hex'),created_by:profile.id});
  if (saved.error) throw new Error('Unable to prepare Gmail connection.');
  return token;
}
export async function revokeSupplierConnection(id: string) {
  await requireRole(['admin']);
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid connection.');
  const result = await createAdminClient().from('supplier_mail_connections').update({revoked_at:new Date().toISOString()}).eq('id',id);
  if (result.error) throw new Error('Unable to revoke connection.');
}
export async function supplierDocumentUrl(id: string) {
  await requireRole(['admin','management_viewer']);
  const db = await createClient();
  const doc = await db.from('supplier_mail_documents').select('storage_path,file_name').eq('id',id).single();
  if (doc.error || !doc.data) throw new Error('Document not found.');
  const signed = await db.storage.from('supplier-mail').createSignedUrl(doc.data.storage_path,300);
  if (signed.error) throw new Error('Unable to open document.');
  return signed.data.signedUrl;
}
export async function markSupplierEmailRead(id: string) {
  const profile = await requireRole(['admin','management_viewer']);
  if (!/^[0-9a-f]{10,40}$/.test(id)) throw new Error('Invalid email.');
  const db = await createClient();
  const result = await db.from('supplier_email_reads').upsert({message_id:id,user_id:profile.id},{onConflict:'user_id,message_id',ignoreDuplicates:true});
  if (result.error) throw new Error('Unable to mark email as read.');
}
export async function classifySupplierDocument(id: string, folder: string) {
  await requireRole(['admin','management_viewer']);
  const {folders}=await import('@/lib/supplier-mail/rules');
  if(!/^[a-f0-9-]{36}$/i.test(id)||!folders.some(f=>f===folder)) throw new Error('Invalid document category.');
  const db=await createClient();
  const saved=await db.from('supplier_mail_documents').update({folder}).eq('id',id).select('id').single();
  if(saved.error)throw new Error('Unable to save category.');
  const {revalidatePath}=await import('next/cache');
  revalidatePath('/documents/suppliers','layout');
}
