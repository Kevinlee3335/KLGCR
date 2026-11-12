import { createClient } from '@/lib/supabase/server';
import { isSupplierId, suppliers, type Supplier } from './rules';

type Client = Awaited<ReturnType<typeof createClient>>;
type SupplierCompany = { id: string; name: string };
const legacyCompanies = Object.entries(suppliers).map(([id, { name }]) => ({ id, name }));

export async function listSupplierCompanies(db?: Client): Promise<SupplierCompany[]> {
  const client = db ?? await createClient();
  const result = await client.from('supplier_mail_suppliers').select('id,name').order('name').order('id');
  return result.error ? legacyCompanies : result.data ?? [];
}

export async function getSupplierCompany(id: string, db?: Client): Promise<SupplierCompany | null> {
  if (!isSupplierId(id)) return null;
  const client = db ?? await createClient();
  const result = await client.from('supplier_mail_suppliers').select('id,name').eq('id', id).maybeSingle();
  if (result.error) return legacyCompanies.find(company => company.id === id) ?? null;
  return result.data;
}

// Malaysia has a fixed UTC+8 offset. Use the email's received date, never the import timestamp.
export function supplierMailDayWindow(now = new Date()) {
  const localDay = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0,10);
  const start = new Date(localDay + 'T00:00:00+08:00');
  return { start: start.toISOString(), end: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString() };
}
export async function recentSupplierEmails(limit = 5) {
  const {start,end}=supplierMailDayWindow();
  const db = await createClient();
  const result = await db.from('supplier_emails').select('id,company,sender,subject,received_at,supplier_mail_suppliers(name)')
    .gte('received_at',start).lt('received_at',end).order('received_at',{ascending:false}).order('id').limit(limit);
  if (!result.error) {
    return { error: null, data: result.data.map(({supplier_mail_suppliers: supplier, ...row}) => ({
      ...row, supplierName: (Array.isArray(supplier) ? supplier[0] : supplier)?.name ?? row.company,
    })) };
  }
  const legacy = await db.from('supplier_emails').select('id,company,sender,subject,received_at')
    .gte('received_at',start).lt('received_at',end).order('received_at',{ascending:false}).order('id').limit(limit);
  return { error: legacy.error, data: legacy.data?.map(row => ({...row, supplierName: suppliers[row.company as Supplier]?.name ?? row.company})) ?? null };
}
