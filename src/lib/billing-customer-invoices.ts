import {createHash, randomUUID} from 'node:crypto';
import {PDFDocument, PDFName} from 'pdf-lib';
import {z} from 'zod';
import {BILLING_APPROVER_ID, withBillingApproval, type BillingApproval} from './billing-approval';
import {monthSchema, type BillingLine, type BillingSnapshot} from './billing-preview';
import {appendCustomerMeterPages} from './billing-customer-meter-pages';
import {BILLING_MAIL_FROM, MANUALLY_SENT_CUSTOMER_INVOICE_MESSAGE, MANUALLY_SENT_CUSTOMER_INVOICE_PERIOD} from './billing-mail-settings';
import {gmailGateway} from './billing-mail';
import {sendFinancePdf} from './finance-mail';
import {createAdminClient} from './supabase/admin';
import {createClient} from './supabase/server';

export const maxCustomerInvoiceUpload = 4_000_000;
const bucket = 'billing-customer-invoices';
const packageTable = 'billing_customer_invoice_packages';
const maxPackageBytes = 11_000_000;

type Kind = BillingSnapshot['kind'];
type ApprovedLine = {id: string; kind: Kind; index: number; line: BillingLine; email: string};
type CustomerInvoiceRow = {
  id: string;
  period: string;
  company_name: string;
  recipient: string;
  file_name: string;
  rental_run_id: string | null;
  rental_line_index: number | null;
  rental_invoice_no: string | null;
  utility_run_id: string | null;
  utility_line_index: number | null;
  utility_invoice_no: string | null;
  page_count: number;
  created_at: string;
  confirmed_at: string | null;
  attempted_at: string | null;
  sent_at: string | null;
  delivery_error: string | null;
  status: 'draft' | 'sending' | 'delivery_pending' | 'sent';
};
export type CustomerInvoiceCatalog = {
  accounts: {id: string; kind: Kind; index: number; name: string; billNo: string; amount: number; email: string; packaged: boolean}[];
  packages: CustomerInvoiceRow[];
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const emailSchema = z.string().trim().max(254).email().regex(/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/).transform(normalizeEmail);
const pageSchema = z.object({runId: z.string().uuid(), lineIndex: z.number().int().nonnegative(), page: z.number().int().min(1).max(500), invoiceNo: z.string().trim().max(70).regex(/^[a-z0-9/_. -]*$/i)});
export const customerInvoiceDraftSchema = z.object({
  period: monthSchema,
  rental: pageSchema.nullable(),
  utility: pageSchema.nullable(),
  email: z.union([emailSchema, z.literal('')]),
}).refine(input => input.rental || input.utility, 'Select at least one approved invoice.');

export class CustomerInvoiceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function requireCustomerInvoicePeriod(period: string) {
  if (period === MANUALLY_SENT_CUSTOMER_INVOICE_PERIOD) {
    throw new CustomerInvoiceError(MANUALLY_SENT_CUSTOMER_INVOICE_MESSAGE, 409);
  }
}

function companyIdentity(name: string) {
  return name.replace(/\s+\(\d{4,}(?:-[a-z])?\)\s*$/i, '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function fileName(company: string, period: string) {
  const name = company.normalize('NFKD').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80);
  return `KLGCR-${name || 'Company'}-${period}-Invoices.pdf`;
}

const objectPath = (id: string) => `${id}.pdf`;

async function approvedLines(period: string): Promise<ApprovedLine[]> {
  const db = createAdminClient();
  const [runs, contacts] = await Promise.all([
    db.from('billing_preview_runs').select('id,kind,snapshot').eq('period', period).in('kind', ['rental', 'utility']),
    db.from('billing_payment_contacts').select('kind,account_key,email'),
  ]);
  if (runs.error || contacts.error) throw new CustomerInvoiceError('Unable to load approved invoices and registered contacts.', 503);
  const ids = runs.data.map(run => run.id);
  if (!ids.length) return [];
  const approvals = await db.from('billing_run_approvals').select('*').in('run_id', ids).eq('approved_by_user', BILLING_APPROVER_ID);
  if (approvals.error) throw new CustomerInvoiceError('Unable to verify James approval.', 503);
  const approvalMap = new Map((approvals.data as BillingApproval[]).map(row => [row.run_id, row]));
  const emails = new Map(contacts.data.map(row => [`${row.kind}:${row.account_key}`, normalizeEmail(row.email)]));
  return runs.data.flatMap(run => {
    const kind = run.kind as Kind;
    const snapshot = withBillingApproval(run.snapshot, approvalMap.get(run.id));
    if (!snapshot.approval || !Array.isArray(snapshot.lines)) return [];
    return snapshot.lines.flatMap((line, index) => line.accountId && !(kind === 'utility' && line.documentKind === 'statement')
      ? [{id: run.id, kind, index, line, email: emails.get(`${kind}:${line.accountId}`) || ''}]
      : []);
  });
}

export async function loadCustomerInvoiceCatalog(period: string): Promise<CustomerInvoiceCatalog> {
  const [lines, packages] = await Promise.all([
    approvedLines(period),
    createAdminClient().from(packageTable).select('*')
      .eq('period', period).order('company_name').order('created_at'),
  ]);
  if (packages.error) throw new CustomerInvoiceError('Unable to load saved customer invoice packages.', 503);
  const used = new Set(packages.data.flatMap(row => [
    `${row.rental_run_id}:${row.rental_line_index}`, `${row.utility_run_id}:${row.utility_line_index}`,
  ]));
  return {
    accounts: lines.map(({id, kind, index, line, email}) => ({
      id, kind, index, name: line.name, billNo: line.billNo, amount: line.amount, email, packaged: used.has(`${id}:${index}`),
    })),
    packages: packages.data,
  };
}

function selectedLine(lines: ApprovedLine[], kind: Kind, selection: z.infer<typeof pageSchema> | null) {
  if (!selection) return null;
  const account = lines.find(line => line.kind === kind && line.id === selection.runId && line.index === selection.lineIndex);
  if (!account) throw new CustomerInvoiceError(`Select an approved ${kind === 'rental' ? 'Rental' : 'Utilities'} invoice for this month.`);
  return {account, page: selection.page, invoiceNo: selection.invoiceNo};
}

async function loadScan(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length < 8 || bytes.subarray(0, 5).toString() !== '%PDF-') throw new CustomerInvoiceError('Choose a valid Accounts PDF.');
  try {
    const document = await PDFDocument.load(bytes, {updateMetadata: false});
    return {document, hash: createHash('sha256').update(bytes).digest('hex')};
  } catch {
    throw new CustomerInvoiceError('The Accounts PDF cannot be read. Use an unlocked PDF.');
  }
}

export async function assembleCustomerInvoicePdf(
  companyName: string, period: string, pages: {document: PDFDocument; page: number}[],
  utility?: {line: BillingLine; heading?: string},
) {
  const pdf = await PDFDocument.create();
  for (const {document, page} of pages) {
    if (page > document.getPageCount()) throw new CustomerInvoiceError('An assigned Accounts page is outside the uploaded PDF.');
    const [officialPage] = await pdf.copyPages(document, [page - 1]);
    officialPage.node.delete(PDFName.of('AA'));
    officialPage.node.delete(PDFName.of('Annots'));
    pdf.addPage(officialPage);
  }
  if (utility) await appendCustomerMeterPages(pdf, utility.line, utility.heading);
  pdf.setTitle(`${companyName} | ${period} | KLG Campus Residence Invoices`);
  return pdf;
}

export async function saveCustomerInvoiceDraft(
  input: z.infer<typeof customerInvoiceDraftSchema>, primaryFile: File, utilityFile: File | null, admin: string,
): Promise<CustomerInvoiceRow> {
  requireCustomerInvoicePeriod(input.period);
  if (primaryFile.size + (utilityFile?.size || 0) > maxCustomerInvoiceUpload) {
    throw new CustomerInvoiceError('Keep the Accounts PDF upload under 4 MB. Split large scans first.', 413);
  }
  const [lines, primaryScan, utilityScan] = await Promise.all([
    approvedLines(input.period), loadScan(primaryFile), utilityFile ? loadScan(utilityFile) : Promise.resolve(null),
  ]);
  const rental = selectedLine(lines, 'rental', input.rental);
  const utility = selectedLine(lines, 'utility', input.utility);
  if (!rental && !utility) throw new CustomerInvoiceError('Select at least one approved invoice.');
  const selected = (rental ?? utility)!.account;
  const companyName = selected.line.name;
  const companyKey = companyIdentity(companyName);
  if (rental && utility && companyIdentity(utility.account.line.name) !== companyKey) {
    throw new CustomerInvoiceError('Select Rental and Utilities accounts for the same company.');
  }
  if ((!rental || !utility) && lines.some(line => line.kind !== selected.kind && companyIdentity(line.line.name) === companyKey)) {
    throw new CustomerInvoiceError('This company has approved Rental and Utilities invoices. Add both Accounts pages to the same package.');
  }
  const registered = [...new Set([rental?.account.email, utility?.account.email].filter(Boolean))];
  if (registered.length > 1 || (registered[0] && input.email && input.email !== registered[0])) {
    throw new CustomerInvoiceError('Selected accounts have different registered customer emails. Check the company and account selection.');
  }
  const recipient = emailSchema.safeParse(registered[0] || input.email);
  if (!recipient.success) throw new CustomerInvoiceError('Enter the verified company email to prepare this package.');

  const pages: {source_hash: string; page_number: number}[] = [];
  const officialPages: {document: PDFDocument; page: number}[] = [];
  for (const selection of [rental, utility]) {
    if (!selection) continue;
    const source = selection.account.kind === 'utility' && utilityScan ? utilityScan : primaryScan;
    if (pages.some(page => page.source_hash === source.hash && page.page_number === selection.page)) {
      throw new CustomerInvoiceError('Use a different Accounts page for each invoice.');
    }
    officialPages.push({document: source.document, page: selection.page});
    pages.push({source_hash: source.hash, page_number: selection.page});
  }
  let heading: string | undefined;
  if (utility) {
    const session = await createClient();
    const settings = await session.from('billing_preview_settings').select('config').eq('id', 1).single();
    heading = settings.data?.config?.utilityAccounts?.find((account: {id: string}) => account.id === utility.account.line.accountId)?.title;
  }
  const pdf = await assembleCustomerInvoicePdf(companyName, input.period, officialPages, utility ? {line: utility.account.line, heading} : undefined);
  const bytes = await pdf.save();
  if (bytes.byteLength > maxPackageBytes) throw new CustomerInvoiceError('The merged PDF is too large to attach to email.');

  const id = randomUUID();
  const db = createAdminClient();
  const storage = db.storage.from(bucket);
  const uploaded = await storage.upload(objectPath(id), bytes, {contentType: 'application/pdf'});
  if (uploaded.error) throw new CustomerInvoiceError('Unable to archive the merged invoice PDF.', 503);
  const draft = await db.rpc('create_billing_customer_invoice_package', {
    p_package: {
      id, period: input.period, company_name: companyName, recipient: recipient.data, file_name: fileName(companyName, input.period),
      page_count: pdf.getPageCount(), created_by: admin,
      rental_run_id: rental?.account.id ?? null, rental_line_index: rental?.account.index ?? null, rental_account_key: rental?.account.line.accountId ?? null, rental_invoice_no: rental?.invoiceNo || null,
      utility_run_id: utility?.account.id ?? null, utility_line_index: utility?.account.index ?? null, utility_account_key: utility?.account.line.accountId ?? null, utility_invoice_no: utility?.invoiceNo || null,
    },
    p_pages: pages,
  });
  if (draft.error) {
    const existing = await db.from(packageTable).select('*').eq('id', id).maybeSingle();
    if (existing.data) return existing.data;
    if (!existing.error) await storage.remove([objectPath(id)]);
    if (draft.error.code === '23505') throw new CustomerInvoiceError('One of these Accounts pages or invoices is already assigned to another package. Check the saved drafts.', 409);
    throw new CustomerInvoiceError('Unable to save the package. Check the draft list before retrying.', 503);
  }
  return draft.data;
}

export async function openCustomerInvoicePdf(id: string) {
  const db = createAdminClient();
  const row = await db.from(packageTable).select('file_name').eq('id', id).maybeSingle();
  if (row.error) throw new CustomerInvoiceError('Unable to find the saved package.', 503);
  if (!row.data) throw new CustomerInvoiceError('Invoice package not found.', 404);
  const link = await db.storage.from(bucket).createSignedUrl(objectPath(id), 120);
  if (link.error) throw new CustomerInvoiceError('Unable to open the archived PDF.', 503);
  return link.data.signedUrl;
}

export async function deleteCustomerInvoiceDraft(id: string) {
  const db = createAdminClient();
  const removed = await db.from(packageTable).delete().eq('id', id).eq('status', 'draft').select('id').maybeSingle();
  if (removed.error) throw new CustomerInvoiceError('Unable to discard this draft.', 503);
  if (!removed.data) throw new CustomerInvoiceError('Only an unconfirmed draft can be discarded.', 409);
  await db.storage.from(bucket).remove([objectPath(id)]);
}

export async function dispatchCustomerInvoice(id: string, admin: string) {
  const db = createAdminClient();
  const period = await db.from(packageTable).select('period').eq('id', id).maybeSingle();
  if (period.error) throw new CustomerInvoiceError('Unable to check the package billing period.', 503);
  if (!period.data) throw new CustomerInvoiceError('Invoice package not found.', 404);
  requireCustomerInvoicePeriod(period.data.period);

  const claim = await db.rpc('claim_billing_customer_invoice_delivery', {p_id: id, p_admin: admin});
  if (claim.error) {
    if (claim.error.message.includes('Registered customer email changed')) {
      throw new CustomerInvoiceError('The registered customer email changed. Check the contact before sending.', 409);
    }
    throw new CustomerInvoiceError('Unable to start delivery. Check the package status before retrying.', 503);
  }
  const pack: CustomerInvoiceRow | null = claim.data;
  if (!pack?.id) {
    const current = await db.from(packageTable).select('*').eq('id', id).maybeSingle();
    if (!current.data || current.error) throw new CustomerInvoiceError('Unable to read the package status.', 503);
    return current.data as CustomerInvoiceRow;
  }
  requireCustomerInvoicePeriod(pack.period);
  let sent = false;
  let deliveryError = 'Delivery needs checking. Retry uses the same delivery key.';
  try {
    const gateway = await gmailGateway({action: 'finance-capabilities'}, 12_000);
    if (gateway.ok !== true || gateway.sender !== BILLING_MAIL_FROM || !Array.isArray(gateway.capabilities) || !gateway.capabilities.includes('customerInvoicePdf')) {
      deliveryError = 'Update the noreply Gmail gateway for customer invoice PDF delivery, then retry.';
      throw new Error(deliveryError);
    }
    const file = await db.storage.from(bucket).download(objectPath(pack.id));
    if (file.error) throw new Error('Unable to open the archived PDF.');
    await sendFinancePdf({
      key: `invoice_${pack.id}`,
      to: pack.recipient,
      subject: `KLG Campus Residence invoices - ${pack.period}`,
      text: `Dear ${pack.company_name},\n\nPlease find your KLG Campus Residence invoice package attached for ${pack.period}.\n\nKLG Campus Residence Management`,
      pdf: Buffer.from(await file.data.arrayBuffer()),
      fileName: pack.file_name,
    });
    sent = true;
  } catch {
    // A gateway timeout can follow a successful send. Retrying uses the original delivery key.
  }
  const saved = await db.from(packageTable).update({
    status: sent ? 'sent' : 'delivery_pending',
    sent_at: sent ? new Date().toISOString() : null,
    delivery_error: sent ? null : deliveryError,
  }).eq('id', id).eq('status', 'sending').eq('attempted_at', pack.attempted_at).select('*').maybeSingle();
  if (saved.error || !saved.data) throw new CustomerInvoiceError('Delivery status needs checking. Retry uses the same delivery key.', 503);
  return saved.data as CustomerInvoiceRow;
}
