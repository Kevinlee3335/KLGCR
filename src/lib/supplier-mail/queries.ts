import { createClient } from '@/lib/supabase/server';
export async function recentSupplierEmails(limit = 5) {
  const db = await createClient();
  return db.from('supplier_emails').select('id,company,sender,subject,received_at').order('received_at',{ascending:false}).order('id').limit(limit);
}
