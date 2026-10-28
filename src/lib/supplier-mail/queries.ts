import { createClient } from '@/lib/supabase/server';
// Malaysia has a fixed UTC+8 offset. Use the email's received date, never the import timestamp.
export function supplierMailDayWindow(now = new Date()) {
  const localDay = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0,10);
  const start = new Date(localDay + 'T00:00:00+08:00');
  return { start: start.toISOString(), end: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString() };
}
export async function recentSupplierEmails(limit = 5) {
  const {start,end}=supplierMailDayWindow();
  const db = await createClient();
  return db.from('supplier_emails').select('id,company,sender,subject,received_at').gte('received_at',start).lt('received_at',end).order('received_at',{ascending:false}).order('id').limit(limit);
}
