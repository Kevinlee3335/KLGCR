import { createAdminClient } from './supabase/admin';
import { malaysiaDay } from './membership';
import { buildMembershipMaster, decodeMasterLayout, type MasterMember, type MasterPayment } from './membership-master';

type Database = ReturnType<typeof createAdminClient>;
const pageSize = 500;

async function readPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, message: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error || !data) throw new Error(message);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

type Template = { layout: Parameters<typeof decodeMasterLayout>[0] };

async function readMaster<T extends Template>(db: Database, template: PromiseLike<{ data: T | null; error: unknown }>) {
  const [source, members, removed, payments] = await Promise.all([
    template,
    readPages<MasterMember>((from, to) => db.from('memberships').select('id,full_name,room_no,member_number,member_type,status,starts_on,expires_on,created_at').order('id').range(from, to), 'Unable to load members.'),
    readPages((from, to) => db.from('membership_payment_ledger').select('payment_id').not('deleted_at','is',null).order('id').range(from, to), 'Unable to check deleted payments.'),
    readPages<MasterPayment>((from, to) => db.from('membership_payments').select('id,member_id,period_start,amount,kind').eq('status','approved').order('id').range(from, to), 'Unable to load approved payments.'),
  ]);
  if (source.error || !source.data?.layout) throw new Error('Unable to load the original membership workbook.');
  const removedIds = new Set(removed.map(row => row.payment_id));
  const result = buildMembershipMaster(decodeMasterLayout(source.data.layout), members, payments.filter(row => !removedIds.has(row.id)), malaysiaDay());
  return { result, template: source.data };
}

export async function loadMembershipMasterReport() {
  const db = createAdminClient();
  const { result } = await readMaster<Template>(db, db.from('membership_master_templates').select('layout').eq('id', 'gym-master-v1').eq('ready', true).single());
  return result;
}

export async function loadMembershipMaster() {
  const db = createAdminClient();
  const { result, template } = await readMaster<Template & { workbook_base64: string }>(db, db.from('membership_master_templates').select('workbook_base64,layout').eq('id', 'gym-master-v1').eq('ready', true).single());
  return { result, bytes: Buffer.from(template.workbook_base64, 'base64') };
}
