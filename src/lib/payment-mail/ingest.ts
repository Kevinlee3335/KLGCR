import {createHash} from 'node:crypto';
import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {loadPaymentMailSenders, type PaymentMailConnection} from './connections';
import {aggregatePaymentExtractions, extractPaymentAttachment, hasPaymentMailClue, paymentExtractionSchema, unclearPayment} from './extract';
import {PaymentMailError} from './queries';
import {
  inPaymentMailRange, normalizePaymentSender, paymentFileExtension, paymentFileMagic, paymentMimeTypes,
  PAYMENT_MAILBOX, PAYMENT_MAIL_MAX_BYTES, PAYMENT_MAIL_MAX_PARTS, PAYMENT_MAIL_PROTOCOL,
} from './rules';

const base = {mailbox: z.literal(PAYMENT_MAILBOX), protocol: z.literal(PAYMENT_MAIL_PROTOCOL)};
const gmailId = z.string().regex(/^[a-f0-9]{1,64}$/i).transform(value => value.toLowerCase());
const partId = z.string().regex(/^[0-9.]{1,80}$/);
const filename = z.string().trim().min(1).max(300)
  .transform(value => Array.from(value, character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? '_' : character).join(''));
const file = z.object({
  partId, filename, mimeType: z.enum(paymentMimeTypes),
  hash: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().positive().max(PAYMENT_MAIL_MAX_BYTES),
});
const issue = z.object({
  partId, filename,
  reason: z.enum(['unsupported', 'oversize', 'empty', 'invalid', 'unavailable', 'part_limit']),
});
const issueText = {
  unsupported: 'file type is not supported (PDF, JPG and PNG are supported)',
  oversize: 'file exceeds 10 MB',
  empty: 'file is empty',
  invalid: 'file could not be verified as a supported payment proof',
  unavailable: 'Gmail did not provide the file',
  part_limit: 'additional attachments exceeded the import limit',
};

export const paymentMailIngestSchema = z.discriminatedUnion('op', [
  z.object({...base, op: z.literal('config')}),
  z.object({...base, op: z.literal('heartbeat'), state: z.enum(['ok', 'error'])}),
  z.object({...base, op: z.literal('message'), id: gmailId, threadId: gmailId.optional(),
    sender: z.string().max(600), subject: z.string().max(2000), body: z.string().max(200000),
    receivedAt: z.string().datetime({offset: true}),
    partIds: z.array(partId).max(PAYMENT_MAIL_MAX_PARTS).refine(values => new Set(values).size === values.length),
  }),
  z.object({...base, op: z.literal('prepare'), id: gmailId, file}),
  z.object({...base, op: z.literal('complete'), id: gmailId, file}),
  z.object({...base, op: z.literal('finalize'), id: gmailId, issues: z.array(issue).max(PAYMENT_MAIL_MAX_PARTS)}),
]);

type Db = ReturnType<typeof createAdminClient>;
type Input = z.infer<typeof paymentMailIngestSchema>;
type MessageInput = Extract<Input, {op: 'message'}>;
type FileInput = Extract<Input, {op: 'prepare' | 'complete'}>;
type FinalizeInput = Extract<Input, {op: 'finalize'}>;
type Message = {
  id: string;
  sender_email: string;
  subject: string;
  body_text: string;
  received_at: string;
  ingestion_completed_at: string | null;
  extraction_details: {partIds?: string[]};
};

const unavailable = () => new PaymentMailError('Payment email import could not finish. Retry this mailbox check.', 503);
const attachmentFields = 'gmail_part_id,content_hash,mime_type,size_bytes,status,extraction_details';
const proofBucket = 'billing-payments';

async function loadMessage(db: Db, id: string): Promise<Message | null> {
  const result = await db.from('payment_mail_messages').select(
    'id,sender_email,subject,body_text,received_at,ingestion_completed_at,extraction_details',
  ).eq('gmail_message_id', id).maybeSingle();
  if (result.error) throw unavailable();
  return result.data;
}

async function registerMessage(db: Db, connection: PaymentMailConnection, input: MessageInput) {
  const sender = normalizePaymentSender(input.sender);
  if (!sender || !inPaymentMailRange(input.receivedAt, connection.enabled_from)) return {skip: true};
  const existing = await loadMessage(db, input.id);
  if (existing?.ingestion_completed_at) return {done: true};
  const body = input.body.replace(/\0/g, '');
  const subject = input.subject.replace(/\0/g, '');
  if (!input.partIds.length && !hasPaymentMailClue(`${subject}\n${body}`)) return {skip: true};
  const senders = await loadPaymentMailSenders(db);
  if (!senders.some(contact => contact.email === sender.email)) return {skip: true};
  if (!existing) {
    const result = await db.from('payment_mail_messages').upsert({
      mailbox: PAYMENT_MAILBOX, gmail_message_id: input.id, gmail_thread_id: input.threadId || null,
      sender_email: sender.email, sender_name: sender.name, subject, body_text: body,
      received_at: input.receivedAt, suggested_company_key: sender.email,
      extraction_details: {partIds: input.partIds},
    }, {onConflict: 'gmail_message_id', ignoreDuplicates: true});
    if (result.error) throw unavailable();
  }
  const finishedParts = existing
    ? await db.from('payment_mail_attachments').select('gmail_part_id').eq('message_id', existing.id)
    : null;
  if (finishedParts?.error) throw unavailable();
  return {done: false, finishedPartIds: (finishedParts?.data || []).map(row => row.gmail_part_id)};
}

async function importFile(db: Db, connection: PaymentMailConnection, message: Message, input: FileInput) {
  const file = input.file;
  if (!message.extraction_details.partIds?.includes(file.partId)) throw new PaymentMailError('Unexpected payment email attachment', 409);
  const existing = await db.from('payment_mail_attachments').select(attachmentFields)
    .eq('message_id', message.id).eq('gmail_part_id', file.partId).maybeSingle();
  if (existing.error) throw unavailable();
  if (existing.data) {
    if (existing.data.content_hash !== file.hash || existing.data.mime_type !== file.mimeType || existing.data.size_bytes !== file.size) {
      throw new PaymentMailError('Payment email attachment conflicts with an existing file', 409);
    }
    return {done: true};
  }
  const directory = `payment-mail/${message.id}`;
  const name = `${file.hash}.${paymentFileExtension(file.mimeType)}`;
  const path = `${directory}/${name}`;
  const storage = db.storage.from(proofBucket);
  if (input.op === 'prepare') {
    const objects = await storage.list(directory, {search: name, limit: 1});
    if (objects.error) throw unavailable();
    if (objects.data.some(object => object.name === name)) return {needsComplete: true};
    const signed = await storage.createSignedUploadUrl(path, {upsert: false});
    if (signed.error) throw unavailable();
    return {uploadUrl: signed.data.signedUrl};
  }

  const downloaded = await storage.download(path);
  if (downloaded.error) throw unavailable();
  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  if (bytes.length !== file.size || !paymentFileMagic(bytes, file.mimeType) || createHash('sha256').update(bytes).digest('hex') !== file.hash) {
    // Only discard a path if no finalized attachment references it. Equal hashes can occur twice within one email.
    const linked = await db.from('payment_mail_attachments').select('id').eq('message_id', message.id)
      .eq('content_hash', file.hash).limit(1).maybeSingle();
    if (linked.error) throw unavailable();
    if (!linked.data) {
      const removed = await storage.remove([path]);
      if (removed.error) throw unavailable();
    }
    return {invalidFile: true};
  }
  const extraction = await extractPaymentAttachment({bytes, mimeType: file.mimeType, actorId: connection.created_by});
  const saved = await db.from('payment_mail_attachments').upsert({
    message_id: message.id, gmail_part_id: file.partId, filename: file.filename, mime_type: file.mimeType,
    size_bytes: file.size, content_hash: file.hash, storage_path: path,
    status: extraction.classification === 'not_payment' ? 'ignored' : 'ready',
    extraction_text: extraction.evidenceText.replace(/\0/g, ''), extraction_details: extraction,
  }, {onConflict: 'message_id,gmail_part_id', ignoreDuplicates: true});
  if (saved.error) throw unavailable();
  return {done: true};
}

async function verifiedPaymentProof(db: Db, hash: string, excluding: string) {
  type Duplicate = {message_id: string; storage_path: string; mail: {receipt: {proof_path: string}}};
  for (let offset = 0; ; offset += 100) {
    const result = await db.from('payment_mail_attachments')
      .select('message_id,storage_path,mail:payment_mail_messages!inner(status,receipt:official_receipts!inner(proof_path))')
      .eq('content_hash', hash).eq('mail.status', 'verified').neq('message_id', excluding)
      .order('created_at').order('id').range(offset, offset + 99).overrideTypes<Duplicate[], {merge: false}>();
    if (result.error) throw unavailable();
    const matching = result.data.find(candidate => candidate.storage_path === candidate.mail.receipt.proof_path);
    if (matching || result.data.length < 100) return matching?.message_id || null;
  }
}

async function finalizeMessage(db: Db, connection: PaymentMailConnection, message: Message, input: FinalizeInput) {
  const parts = message.extraction_details.partIds || [];
  const attachments = await db.from('payment_mail_attachments').select(attachmentFields).eq('message_id', message.id);
  if (attachments.error) throw unavailable();
  const saved = new Set(attachments.data.map(row => row.gmail_part_id));
  const issues = new Map(input.issues.map(item => [item.partId, item]));
  if (issues.size !== input.issues.length || [...issues.keys()].some(id => !parts.includes(id) || saved.has(id))) {
    throw new PaymentMailError('Unexpected payment email attachment issue', 409);
  }
  if (parts.some(id => !saved.has(id) && !issues.has(id))) throw new PaymentMailError('Payment email attachments are still importing', 409);
  const extraction = aggregatePaymentExtractions(
    attachments.data.map(row => {
      const parsed = paymentExtractionSchema.safeParse(row.extraction_details);
      return parsed.success ? parsed.data : unclearPayment('Automatic reading was inconclusive');
    }),
    `${message.subject}\n${message.body_text}`,
    input.issues.map(item => `${item.filename}: ${issueText[item.reason]}`),
  );
  let duplicateOf: string | null = null;
  // Exact proof bytes are strong evidence of a duplicate only after the original was verified.
  // Leave mail with several distinct proofs in the queue so an additional payment is not hidden.
  const hashes = [...new Set(attachments.data.filter(row => row.status === 'ready').map(row => row.content_hash))];
  if (extraction.status !== 'ignored' && hashes.length === 1 && !issues.size) {
    duplicateOf = await verifiedPaymentProof(db, hashes[0], message.id);
  }
  const now = new Date().toISOString();
  if (extraction.status !== 'ignored') {
    const updated = await db.from('payment_mail_connections').update({last_received_at: now})
      .eq('id', connection.id).is('revoked_at', null);
    if (updated.error) throw unavailable();
  }
  const result = await db.from('payment_mail_messages').update({
    ...extraction, status: duplicateOf ? 'duplicate' : extraction.status, duplicate_of: duplicateOf,
    attachment_count: attachments.data.length, ingestion_completed_at: now, updated_at: now,
  }).eq('id', message.id).is('ingestion_completed_at', null);
  if (result.error) throw unavailable();
  return {done: true};
}

export async function ingestPaymentMail(db: Db, connection: PaymentMailConnection, input: Input) {
  if (input.op === 'config') {
    const senders = await loadPaymentMailSenders(db);
    return {connectionId: connection.id, enabledFrom: connection.enabled_from, senders: senders.map(sender => sender.email)};
  }
  if (input.op === 'heartbeat') {
    const now = new Date().toISOString();
    const update = input.state === 'ok' ? {last_checked_at: now, last_error: null}
      : {last_error: 'Last mailbox check failed. Open the Apps Script execution log and retry.'};
    const result = await db.from('payment_mail_connections').update(update).eq('id', connection.id).is('revoked_at', null);
    if (result.error) throw unavailable();
    return {ok: true};
  }
  if (input.op === 'message') return registerMessage(db, connection, input);

  const message = await loadMessage(db, input.id);
  if (!message || !inPaymentMailRange(message.received_at, connection.enabled_from)) {
    throw new PaymentMailError('Import the payment email first', 409);
  }
  if (message.ingestion_completed_at) return {done: true};
  if (input.op !== 'finalize') return importFile(db, connection, message, input);

  return finalizeMessage(db, connection, message, input);
}
