import { createHash } from 'node:crypto';
import { gmailGateway } from './billing-mail';
import { BILLING_MAIL_FROM, BILLING_MAIL_TO } from './billing-mail-settings';
import { documentReviewers } from './document-review-status';
import { mailbox, supplierForSender } from './supplier-mail/rules';
import { createAdminClient } from './supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;
type DocumentKind = 'quotation' | 'invoice';
type ApprovalDocument = {
  id: string;
  cycle_id: string;
  kind: DocumentKind;
  source: string;
  source_message_id: string | null;
  supplier_document_id: string | null;
  storage_path: string | null;
  size_bytes: number;
  sha256: string;
  file_name: string;
};
type DeliveryStatus = 'pending' | 'sending' | 'sent' | 'blocked' | 'failed' | 'uncertain';
type DeliveryResult = { status: DeliveryStatus; error?: string };
type DeliveryEvent = {
  document_id: string;
  status: DeliveryStatus;
  recipient: string | null;
  attempted_at: string | null;
};
type Destination = { recipient: string; bucket: string; path: string };

const ATTEMPT_LEASE_MS = 120_000;
const MAX_PDF_BYTES = 12_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNCERTAIN = 'Gmail could not confirm delivery. Retry checks the same delivery key.';
const RECIPIENT_REQUIRED = 'A verified reply address for this supplier is required.';

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function supplierReplyAddress(sender: string | null | undefined) {
  if (!sender || /[\r\n]/.test(sender)) return null;
  const address = (sender.match(/^[^<>]*<([^<>]+)>\s*$/)?.[1] ?? sender).trim().toLowerCase();
  if (address.length > 254 || !/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(address)) return null;
  const [local, domain] = address.split('@');
  if (
    address === mailbox || address === BILLING_MAIL_FROM || address === 'klgcampus@gmail.com'
    || /^(?:[^.]+\.)*(?:keanlenggroup\.com|klgresidence\.com)$/.test(domain)
    || (domain === 'gmail.com' && local.startsWith('klgcr.'))
    || /^(?:no[._-]?reply|do[._-]?not[._-]?reply)(?:[+._-]|$)/.test(local)
  ) return null;
  return address;
}

async function resolveDestination(db: AdminClient, document: ApprovalDocument): Promise<Destination | null> {
  const cycle = await db.from('compliance_cycles').select('record_id').eq('id', document.cycle_id).single();
  if (cycle.error) throw Error('Unable to read the related compliance cycle.');
  const record = await db.from('compliance_records').select('supplier_key,contact_email').eq('id', cycle.data.record_id).single();
  if (record.error) throw Error('Unable to read the related compliance record.');

  let company = record.data.supplier_key;
  let sender = record.data.contact_email;
  let bucket = 'compliance-documents';
  let path = document.storage_path;

  if (document.supplier_document_id) {
    if (!document.source_message_id) return null;
    const [archived, message] = await Promise.all([
      db.from('supplier_mail_documents').select('company,storage_path,content_hash').eq('id', document.supplier_document_id).single(),
      db.from('supplier_emails').select('company,sender').eq('id', document.source_message_id).single(),
    ]);
    if (archived.error || message.error) throw Error('Unable to read the original supplier attachment.');
    if (
      archived.data.company !== message.data.company
      || (company && company !== message.data.company)
      || document.sha256 !== archived.data.content_hash
    ) return null;
    company = message.data.company;
    sender = message.data.sender;
    bucket = 'supplier-mail';
    path = archived.data.storage_path;
  } else if (document.source !== 'upload') {
    return null;
  }

  const recipient = supplierReplyAddress(sender);
  if (!company || !recipient || !path) return null;
  const rules = await db.from('supplier_mail_sender_rules').select('rule,supplier_id').eq('supplier_id', company);
  if (rules.error) throw Error('Unable to check the supplier sender registry.');
  return supplierForSender(recipient, rules.data) === company ? { recipient, bucket, path } : null;
}

async function gatewayReady(kind: DocumentKind) {
  try {
    const result = await gmailGateway({ action: 'compliance-capabilities' }, 12_000);
    return result.ok === true
      && result.sender === BILLING_MAIL_FROM
      && Array.isArray(result.capabilities)
      && ['compliancePdf', 'idempotency'].every(value => result.capabilities.includes(value))
      && (kind === 'quotation' || (result.invoiceCc === BILLING_MAIL_TO && result.capabilities.includes('invoiceCc')));
  } catch {
    return false;
  }
}

export async function dispatchComplianceApprovalEmail(documentId: string): Promise<DeliveryResult> {
  if (!UUID.test(documentId)) return { status: 'blocked', error: 'Invalid compliance document.' };
  const db = createAdminClient();
  const [review, job] = await Promise.all([
    db.from('compliance_cycle_documents').select('id,cycle_id,kind,source,source_message_id,supplier_document_id,storage_path,size_bytes,sha256,file_name')
      .eq('id', documentId).eq('review_stage', 'approved').eq('james_approved_by', documentReviewers[2].id)
      .in('kind', ['quotation', 'invoice']).maybeSingle(),
    db.from('compliance_document_delivery').select('document_id,status,recipient,attempted_at').eq('document_id', documentId).maybeSingle(),
  ]);
  if (review.error || job.error) throw Error('Unable to load the compliance approval delivery.');
  if (!review.data || !job.data) return { status: 'blocked', error: 'James must approve the quotation or invoice before email delivery.' };

  const document = review.data as ApprovalDocument;
  const event = job.data as DeliveryEvent;
  if (event.status === 'sent') return { status: 'sent' };
  if (event.status === 'sending' && event.attempted_at && Date.now() - Date.parse(event.attempted_at) < ATTEMPT_LEASE_MS) {
    return { status: 'sending' };
  }

  const attemptedAt = new Date().toISOString();
  const claim = db.from('compliance_document_delivery').update({ status: 'sending', attempted_at: attemptedAt, error: null })
    .eq('document_id', documentId).eq('status', event.status);
  const claimed = await (event.attempted_at ? claim.eq('attempted_at', event.attempted_at) : claim.is('attempted_at', null))
    .select('document_id').maybeSingle();
  if (claimed.error) throw Error('Unable to claim the compliance approval delivery.');
  if (!claimed.data) return { status: 'sending' };

  let result: DeliveryResult;
  let recipient = event.recipient;
  let sentAt: string | null = null;
  let started = false;
  const previousUncertain = event.status === 'uncertain' || event.status === 'sending';
  try {
    const destination = await resolveDestination(db, document);
    if (!destination || (recipient && recipient !== destination.recipient)) {
      result = { status: 'blocked', error: RECIPIENT_REQUIRED };
    } else if (document.size_bytes > MAX_PDF_BYTES) {
      result = { status: 'blocked', error: 'The original PDF exceeds the Gmail gateway attachment limit.' };
    } else if (!await gatewayReady(document.kind)) {
      result = { status: 'blocked', error: 'Update and deploy the company noreply Gmail gateway for supplier approval emails.' };
    } else {
      const attachment = await db.storage.from(destination.bucket).download(destination.path);
      const pdf = attachment.data && Buffer.from(await attachment.data.arrayBuffer());
      if (attachment.error || !pdf || pdf.length > MAX_PDF_BYTES || !pdf.subarray(0, 1024).includes('%PDF-') || sha256(pdf) !== document.sha256) {
        result = { status: 'failed', error: 'The original PDF is missing, too large or could not be verified.' };
      } else {
        // Pin the verified recipient before contacting Gmail. A retry cannot switch addresses.
        const pinned = await db.from('compliance_document_delivery').update({ recipient: destination.recipient })
          .eq('document_id', documentId).eq('status', 'sending').eq('attempted_at', attemptedAt).select('document_id').maybeSingle();
        if (pinned.error || !pinned.data) throw Error('Unable to save the supplier reply address.');
        recipient = destination.recipient;
        const cc = document.kind === 'invoice' ? [BILLING_MAIL_TO] : [];
        // The same PDF linked to two cycles only generates one message for the same recipient.
        const key = 'compliance_' + sha256([document.kind, recipient, document.sha256].join('\n'));
        const text = [
          'Dear Supplier,',
          'KLG Campus Residence management has approved the attached ' + document.kind + (document.kind === 'invoice' ? ' for processing.' : '.'),
          'The original PDF is attached for your reference.',
          'Thank you,\nKLG Campus Residence Management',
        ].join('\n\n');
        started = true;
        const response = await gmailGateway({
          action: 'compliance-send', key, kind: document.kind, from: BILLING_MAIL_FROM, to: recipient, cc,
          subject: 'Approved supplier ' + document.kind + ' | KLG Campus Residence',
          text, fileName: document.file_name, sha256: document.sha256, pdfBase64: pdf.toString('base64'),
        }, 25_000);
        if (
          response.ok === true && response.status === 'sent' && response.key === key && response.kind === document.kind
          && response.sender === BILLING_MAIL_FROM && response.to === recipient
          && JSON.stringify(response.cc) === JSON.stringify(cc) && response.sha256 === document.sha256
          && typeof response.sentAt === 'string' && Number.isFinite(Date.parse(response.sentAt))
        ) {
          sentAt = response.sentAt;
          result = { status: 'sent' };
        } else if (response.status === 'busy') {
          result = { status: 'pending', error: 'The company Gmail gateway is busy. The email remains queued.' };
        } else if (response.status === 'rejected') {
          result = { status: 'failed', error: 'The company Gmail gateway could not accept the email. Retry the delivery.' };
        } else {
          result = { status: 'uncertain', error: UNCERTAIN };
        }
      }
    }
  } catch {
    result = started ? { status: 'uncertain', error: UNCERTAIN } : { status: 'failed', error: 'Unable to prepare the supplier approval email.' };
  }

  if (previousUncertain && result.status !== 'sent') result = { status: 'uncertain', error: UNCERTAIN };
  const saved = await db.from('compliance_document_delivery')
    .update({ status: result.status, recipient, sent_at: sentAt, error: result.error ?? null })
    .eq('document_id', documentId).eq('status', 'sending').eq('attempted_at', attemptedAt);
  if (saved.error) throw Error('Unable to record the compliance approval delivery result.');
  return result;
}

export async function retryQueuedComplianceMail() {
  const staleBefore = new Date(Date.now() - ATTEMPT_LEASE_MS).toISOString();
  const queue = await createAdminClient().from('compliance_document_delivery').select('document_id')
    .or('status.eq.pending,and(status.eq.sending,attempted_at.lte.' + staleBefore + ')')
    .order('created_at').order('document_id').limit(2);
  if (queue.error) throw Error('Unable to read the compliance approval delivery queue.');
  for (const { document_id } of queue.data) {
    try {
      await dispatchComplianceApprovalEmail(document_id);
    } catch {
      console.error('Queued compliance approval email needs review', { documentId: document_id });
    }
  }
}
