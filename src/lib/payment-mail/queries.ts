import {cache} from 'react';
import {getSessionProfile} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {loadBillingAccountDirectory, loadBillingDocumentRecords} from '@/lib/billing-document-queries';
import type {OfficialReceipt} from '@/lib/official-receipt';
import {paymentSenderGroups} from './rules';
import type {
  PaymentMailCompany, PaymentMailDetail, PaymentMailItem, PaymentMailList,
  PaymentMailListItem, PaymentMailListStatus, PaymentMailInvoice,
} from './types';

export class PaymentMailError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Service-role reads below are only reached after an active Admin session is checked. */
export const requirePaymentMailAdmin = cache(async () => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== 'admin') throw new PaymentMailError('Admin permission required', 403);
  const {data, error} = await createAdminClient().from('profiles').select('id')
    .eq('id', profile.id).eq('role', 'admin').eq('is_active', true).is('deleted_at', null).maybeSingle();
  if (error) throw new PaymentMailError('Unable to check Admin access. Please retry.', 503);
  if (!data) throw new PaymentMailError('Admin permission required', 403);
  return profile;
});

const accountIdentity = (kind: string, key: string) => `${kind}:${key}`;
const normalizedEmail = (email: string) => email.trim().toLowerCase();

const loadCompanies = cache(async () => {
  const db = createAdminClient();
  const [contacts, rentalDirectory, utilityDirectory] = await Promise.all([
    db.from('billing_payment_contacts').select('kind,account_key,email'),
    loadBillingAccountDirectory('rental'), loadBillingAccountDirectory('utility'),
  ]);
  if (contacts.error) throw new PaymentMailError('Unable to load registered company emails', 503);
  const names = new Map([...rentalDirectory, ...utilityDirectory]
    .map(account => [accountIdentity(account.kind, account.account_key), account.account_name]));
  return paymentSenderGroups(contacts.data || []).map(({email, accounts}): PaymentMailCompany => {
    const namedAccounts = accounts.map(account => ({...account,
      account_name: names.get(accountIdentity(account.kind, account.account_key)) || `${account.kind} account ${account.account_key}`,
    })).sort((a, b) => a.kind.localeCompare(b.kind) || a.account_name.localeCompare(b.account_name));
    return {key: email, name: [...new Set(namedAccounts.map(account => account.account_name))].join(' / '), email, accounts: namedAccounts};
  }).sort((a, b) => a.name.localeCompare(b.name));
});

function decorateItem<T extends Omit<PaymentMailListItem, 'suggested_company_name'>>(item: T, companies: PaymentMailCompany[]) {
  return {...item,
    suggested_amount: item.suggested_amount == null ? null : Number(item.suggested_amount),
    suggested_company_name: companies.find(company => company.key === item.suggested_company_key)?.name || null,
  };
}

const attachmentMetadata = 'id,message_id,gmail_part_id,filename,mime_type,size_bytes,content_hash,storage_path,status,created_at';
const listFields = 'id,sender_email,subject,received_at,status,suggested_company_key,suggested_amount,suggested_reference,review_reasons';

export async function loadPaymentMailList(input: {status?: PaymentMailListStatus; limit?: number; offset?: number} = {}): Promise<PaymentMailList> {
  await requirePaymentMailAdmin();
  const status = input.status || 'pending';
  const limit = Math.max(1, Math.min(input.limit || 50, 100));
  const offset = Math.max(0, input.offset || 0);
  const db = createAdminClient();
  let query = db.from('payment_mail_messages').select(listFields, {count: 'exact'})
    .not('ingestion_completed_at', 'is', null);
  if (status === 'pending') query = query.in('status', ['pending_verification', 'needs_review']);
  else if (status === 'all') query = query.neq('status', 'ignored');
  else query = query.eq('status', status);
  const result = await query.order('received_at', {ascending: status === 'pending'}).order('id').range(offset, offset + limit - 1);
  if (result.error) throw new PaymentMailError('Unable to load payment emails. Please retry.', 503);
  const rows = (result.data || []) as Omit<PaymentMailListItem, 'suggested_company_name'>[];
  const companies = rows.some(row => row.suggested_company_key) ? await loadCompanies() : [];
  return {items: rows.map(row => decorateItem(row, companies)), total: result.count || 0};
}

export async function loadPaymentMailItem(id: string): Promise<PaymentMailItem> {
  await requirePaymentMailAdmin();
  const [result, companies] = await Promise.all([
    createAdminClient().from('payment_mail_messages').select(`*,attachments:payment_mail_attachments(${attachmentMetadata})`).eq('id', id).maybeSingle(),
    loadCompanies(),
  ]);
  if (result.error) throw new PaymentMailError('Unable to load this payment email', 503);
  if (!result.data) throw new PaymentMailError('Payment email not found', 404);
  const item = result.data as unknown as Omit<PaymentMailItem, 'suggested_company_name'>;
  return decorateItem({...item, attachments: item.attachments || []}, companies);
}

async function invoiceOptions(company: PaymentMailCompany | undefined): Promise<PaymentMailInvoice[]> {
  if (!company) return [];
  const docs = await Promise.all(company.accounts.map(account => loadBillingDocumentRecords(account.kind, account.account_key)));
  const invoices = docs.flat().filter(doc => doc.approved_at);
  const runIds = [...new Set(invoices.map(doc => doc.run_id))];
  const totals = new Map<string, number>();
  const formalInvoices = new Map<string, {packageId: string; number: string | null}>();
  const db = createAdminClient();
  for (let offset = 0; offset < runIds.length; offset += 100) {
    const ids = runIds.slice(offset, offset + 100);
    for (let page = 0; ; page += 1000) {
      const result = await db.from('billing_customer_invoice_packages')
        .select('id,rental_run_id,rental_line_index,rental_invoice_no,utility_run_id,utility_line_index,utility_invoice_no')
        .or(`rental_run_id.in.(${ids.join(',')}),utility_run_id.in.(${ids.join(',')})`).not('confirmed_at', 'is', null)
        .order('id').range(page, page + 999);
      if (result.error) throw new PaymentMailError('Unable to load confirmed customer invoice numbers', 503);
      for (const row of result.data || []) {
        if (row.rental_run_id) formalInvoices.set(`${row.rental_run_id}:${row.rental_line_index}`, {packageId: row.id, number: row.rental_invoice_no});
        if (row.utility_run_id) formalInvoices.set(`${row.utility_run_id}:${row.utility_line_index}`, {packageId: row.id, number: row.utility_invoice_no});
      }
      if (!result.data || result.data.length < 1000) break;
    }
    for (let page = 0; ; page += 1000) {
      const result = await db.from('billing_payment_allocations').select('run_id,line_index,amount')
        .in('run_id', ids).order('run_id').order('line_index').order('receipt_id').range(page, page + 999);
      if (result.error) throw new PaymentMailError('Unable to load outstanding invoice balances', 503);
      for (const allocation of result.data || []) {
        const key = `${allocation.run_id}:${allocation.line_index}`;
        totals.set(key, (totals.get(key) || 0) + Math.round(Number(allocation.amount) * 100));
      }
      if (!result.data || result.data.length < 1000) break;
    }
  }
  return invoices.map(doc => {
    const key = `${doc.run_id}:${doc.line_index}`;
    const paidCents = totals.get(key) || 0;
    const formal = formalInvoices.get(key);
    return {...doc, bill_no: formal?.number || doc.bill_no, customer_package_id: formal?.packageId,
      amount: Number(doc.amount), paid: paidCents / 100, balance: (Math.round(Number(doc.amount) * 100) - paidCents) / 100};
  }).filter(invoice => invoice.balance > 0)
    .sort((a, b) => a.period.localeCompare(b.period) || a.kind.localeCompare(b.kind) || a.bill_no.localeCompare(b.bill_no));
}

export async function loadPaymentMailDetail(id: string, companyKey?: string): Promise<PaymentMailDetail> {
  const item = await loadPaymentMailItem(id);
  const companies = await loadCompanies();
  const selected = companyKey === undefined ? item.suggested_company_key : normalizedEmail(companyKey);
  const company = companies.find(candidate => candidate.key === selected);
  if (companyKey && !company) throw new PaymentMailError('Select an existing registered company email');
  let receipt: OfficialReceipt | null = null;
  if (item.receipt_id) {
    const result = await createAdminClient().from('official_receipts').select('*').eq('id', item.receipt_id).single();
    if (result.error) throw new PaymentMailError('Unable to load the issued Receipt', 503);
    receipt = result.data;
  }
  const options = item.status === 'pending_verification' || item.status === 'needs_review' ? await invoiceOptions(company) : [];
  return {item, companies, invoiceOptions: options, receipt};
}

export async function paymentMailProofUrl(id: string, proofId: string): Promise<string> {
  await requirePaymentMailAdmin();
  const db = createAdminClient();
  const result = await db.from('payment_mail_attachments').select('storage_path,status')
    .eq('message_id', id).eq('id', proofId).maybeSingle();
  if (result.error) throw new PaymentMailError('Unable to open payment proof', 503);
  if (!result.data || result.data.status !== 'ready') throw new PaymentMailError('Saved payment proof not found', 404);
  if (!new RegExp(`^payment-mail/${id}/[a-f0-9]{64}\\.(pdf|jpg|png)$`).test(result.data.storage_path)) {
    throw new PaymentMailError('Invalid payment proof path', 400);
  }
  const link = await db.storage.from('billing-payments').createSignedUrl(result.data.storage_path, 120);
  if (link.error) throw new PaymentMailError('Unable to open payment proof', 503);
  return link.data.signedUrl;
}
