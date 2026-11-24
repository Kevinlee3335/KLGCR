import type { ImapFlow, MessageStructureObject } from 'imapflow';
import { isUnifiReceiptSubject, unifiEmailText, unifiReceiptDetails } from './unifi-receipt-details';
import { listUnifiReceipts, storeUnifiReceipt } from './unifi-receipts';
import { unifiPdfText, unifiWebmailPdfLimit } from './unifi-invoice-pdf';

function leaves(node?: MessageStructureObject): MessageStructureObject[] {
  return !node ? [] : node.childNodes?.length ? node.childNodes.flatMap(leaves) : [node];
}
async function download(client: ImapFlow, uid: number, part: string, limit: number) {
  const response = await client.download(uid,part,{uid:true,maxBytes:limit+1});
  if (!response.content) throw Error('Missing mail content');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of response.content) {
    const bytes = Buffer.from(chunk); size += bytes.length;
    if (size > limit) throw Error('Mail content exceeds the size limit');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export async function syncUnifiReceiptFolder(client: ImapFlow, folder: string, senders: string[]) {
  const result = { imported:0, errors:0, remaining:0 };
  const archived = new Set((await listUnifiReceipts()).flatMap(receipt=>[receipt.source_message_id,...receipt.source_aliases || []]));
  const ids = await client.search({since:new Date('2026-09-01T00:00:00Z'),or:senders.map(from=>({from}))},{uid:true});
  if (!ids || !ids.length) return result;
  const messages = await client.fetchAll(ids,{envelope:true,bodyStructure:true,internalDate:true},{uid:true});
  let processed = 0;
  for (const message of messages) {
    const envelope = message.envelope;
    const sender = envelope?.from?.[0]?.address?.trim().toLowerCase() || '';
    if (envelope?.from?.length !== 1 || !senders.includes(sender)
      || !isUnifiReceiptSubject(envelope.subject || '')) continue;
    const key = envelope.messageId || `${folder}:${client.mailbox ? client.mailbox.uidValidity : 'unknown'}:${message.uid}`;
    if (archived.has(key)) continue;
    if (processed++ >= 8) { result.remaining++; continue; }
    try {
      const mail = await client.fetchOne(message.uid,{source:true},{uid:true});
      if (!mail || !mail.source || mail.source.length > unifiWebmailPdfLimit) throw Error('Receipt source missing or too large');
      const parts = leaves(message.bodyStructure);
      const plain = parts.find(part=>part.type==='text/plain');
      const bodyPart = plain || parts.find(part=>part.type==='text/html');
      const body = bodyPart?.part ? (await download(client,message.uid,bodyPart.part,256000)).toString('utf8') : '';
      const bodyText = plain ? body.trim() : unifiEmailText(body);
      const files: {name:string;mime_type:string;bytes:Uint8Array}[] = [];
      const evidence = [envelope.subject || '',bodyText];
      let total = mail.source.length;
      for (const part of parts) {
        const name = part.dispositionParameters?.filename ?? part.parameters?.name;
        if (!part.part || !name || !['application/pdf','image/png','image/jpeg'].includes(part.type)
          || (part.type!=='application/pdf' && part.disposition!=='attachment')) continue;
        const bytes = await download(client,message.uid,part.part,unifiWebmailPdfLimit);
        total += bytes.length;
        if (total > 2 * unifiWebmailPdfLimit) throw Error('Receipt attachments exceed the size limit');
        if (part.type==='application/pdf') {
          if (bytes.subarray(0,5).toString() !== '%PDF-') throw Error('Invalid receipt PDF');
          evidence.push(await unifiPdfText(bytes,true).catch(()=>''));
        }
        files.push({name,mime_type:part.type,bytes});
      }
      const received = message.internalDate && new Date(message.internalDate);
      if (!received || !Number.isFinite(received.getTime())) throw Error('Missing receipt date');
      if (await storeUnifiReceipt({source_message_id:key,source_folder:folder,sender,subject:envelope.subject||'',
        received_at:received.toISOString(),body_text:bodyText.slice(0,200000),extracted_text:evidence.join('\n').slice(0,300000),details:unifiReceiptDetails(evidence.join('\n')),
        source:mail.source,attachments:files})) result.imported++;
      archived.add(key);
    } catch { result.errors++; }
  }
  return result;
}
