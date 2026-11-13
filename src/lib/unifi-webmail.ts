import { ImapFlow, type MessageStructureObject } from 'imapflow';
import { dispatchDocumentReviewPushes } from './document-review-notifications';
import { unifiBillingMonth, unifiFirstBillingMonth, unifiFirstPage, unifiInvoiceDetails, unifiWebmailPdfLimit } from './unifi-invoice-pdf';
import { listUnifiInvoices, storeUnifiInvoice } from './unifi-invoices';
import { loadUnifiWebmailPassword, recordUnifiWebmailCheck, unifiWebmailAddress, unifiWebmailHost } from './unifi-webmail-connection';

const sender = 'noreply@unifi.com.my';
const invoiceFilePattern = /^INV\d+\.pdf$/i;

export function unifiPdfParts(node?: MessageStructureObject): { part: string; fileName: string }[] {
  if (!node) return [];
  if (node.childNodes?.length) return node.childNodes.flatMap(unifiPdfParts);
  const fileName = node.dispositionParameters?.filename ?? node.parameters?.name;
  if (!node.part || !fileName || !invoiceFilePattern.test(fileName)) return [];
  return [{ part: node.part, fileName }];
}

function imapClient(password: string) {
  const client = new ImapFlow({
    host: unifiWebmailHost,
    port: 993,
    secure: true,
    auth: { user: unifiWebmailAddress, pass: password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
  });
  client.on('error', () => {});
  return client;
}

export async function verifyUnifiWebmailPassword(password: string) {
  const client = imapClient(password);
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    lock.release();
  } finally {
    client.close();
  }
}

export async function syncUnifiWebmail() {
  const password = await loadUnifiWebmailPassword();
  if (!password) return { status: 'not_connected', imported: 0, needsReview: 0 };
  try {
    const result = await checkInbox(password);
    await recordUnifiWebmailCheck(result.needsReview ? `${result.needsReview} invoice attachment(s) need manual review.` : null, true);
    return result;
  } catch (error) {
    await recordUnifiWebmailCheck('Could not check Webmail. Verify the mailbox connection and try again.', false).catch(() => {});
    throw error;
  }
}

async function checkInbox(password: string) {
  const client = imapClient(password);
  const counts = { status: 'checked', imported: 0, needsReview: 0 };
  try {
    const archived = new Set((await listUnifiInvoices())
      .filter(invoice => invoice.invoice_number)
      .map(invoice => invoice.period + '/' + invoice.invoice_number));
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const ids = await client.search({ since: new Date('2026-09-01T00:00:00Z'), from: sender, subject: 'Your Unifi bill for' }, { uid: true });
      if (!ids || !ids.length) return counts;
      const messages = await client.fetchAll(ids, { envelope: true, bodyStructure: true, internalDate: true }, { uid: true });
      for (const message of messages) {
        const envelope = message.envelope;
        if (envelope?.from?.length !== 1 || envelope.from[0].address?.trim().toLowerCase() !== sender) continue;
        const month = unifiBillingMonth(envelope.subject ?? '');
        if (!month || month < unifiFirstBillingMonth) continue;
        const parts = unifiPdfParts(message.bodyStructure);
        if (!parts.length) counts.needsReview++;
        for (const part of parts) {
          const invoiceNumber = part.fileName.slice(0, -4).toUpperCase();
          const key = month + '/' + invoiceNumber;
          if (archived.has(key)) continue;
          try {
            const download = await client.download(message.uid, part.part, { uid: true, maxBytes: unifiWebmailPdfLimit + 1 });
            if (!download.content) throw Error('Missing invoice attachment');
            const buffers: Buffer[] = [];
            for await (const chunk of download.content) buffers.push(Buffer.from(chunk));
            const bytes = await unifiFirstPage(Buffer.concat(buffers));
            const details = await unifiInvoiceDetails(bytes);
            const received = message.internalDate && new Date(message.internalDate);
            if (details.period !== month || details.invoiceNumber !== invoiceNumber || !details.accountNumber
                || !details.dueDate || !received || !Number.isFinite(received.getTime())) {
              throw Error('Invoice metadata differs from Webmail');
            }
            const item = await storeUnifiInvoice({
              period: month,
              source: 'webmail',
              sourceMessageId: envelope.messageId || `inbox:${client.mailbox ? client.mailbox.uidValidity : 'unknown'}:${message.uid}`,
              invoiceNumber,
              accountNumber: details.accountNumber,
              dueDate: details.dueDate,
              receivedAt: received.toISOString(),
              fileName: invoiceNumber + '.pdf',
              bytes,
            });
            archived.add(key);
            if (item.created) {
              counts.imported++;
              await dispatchDocumentReviewPushes(item.id).catch(() => {});
            }
          } catch {
            counts.needsReview++;
          }
        }
      }
    } finally {
      lock.release();
    }
    return counts;
  } finally {
    client.close();
  }
}
