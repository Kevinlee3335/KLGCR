import { PDFDocument, PDFName } from 'pdf-lib';

export const unifiFirstBillingMonth = '2026-09';
export const unifiManualPdfLimit = 4 * 1024 * 1024;
export const unifiWebmailPdfLimit = 16 * 1024 * 1024;
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function unifiBillingMonth(text: string) {
  const date = text.normalize('NFKC').match(/\b(?:your|of your)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[ -]+(\d{4})\s+Unifi bill\b/i)
    ?? text.normalize('NFKC').match(/\bYour Unifi bill for\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+is ready\b/i);
  if (!date) return null;
  const month = months.findIndex(name => name.toLowerCase() === date[1].toLowerCase()) + 1;
  return date[2] + '-' + String(month).padStart(2, '0');
}

export function unifiInvoiceNumber(text: string) {
  return text.match(/\bBill\s+No\s*:\s*(INV\d+)\b/i)?.[1].toUpperCase() ?? null;
}

function unifiDueDate(text: string) {
  const due = text.match(/\b(?:pay\s+before|bill\s+due\s+by|due\s+date\s*:?)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i);
  if (!due) return null;
  const month = months.findIndex(name => name.toLowerCase() === due[2].toLowerCase()) + 1;
  const date = `${due[3]}-${String(month).padStart(2, '0')}-${due[1].padStart(2, '0')}`;
  const time = Date.parse(date);
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(date) ? date : null;
}

export async function unifiFirstPage(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > unifiWebmailPdfLimit || Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') {
    throw Error('Choose a valid TM Unifi PDF within the file size limit.');
  }
  const original = await PDFDocument.load(bytes, { updateMetadata: false }).catch(() => null);
  if (!original?.getPageCount()) throw Error('The invoice PDF cannot be read. Use an unlocked PDF.');
  const first = await PDFDocument.create({ updateMetadata: false });
  const [page] = await first.copyPages(original, [0]);
  page.node.delete(PDFName.of('AA'));
  page.node.delete(PDFName.of('Annots'));
  first.addPage(page);
  return first.save();
}

export async function unifiInvoiceDetails(bytes: Uint8Array) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true });
  try {
    const document = await task.promise;
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');
    return {
      period: unifiBillingMonth(text),
      invoiceNumber: unifiInvoiceNumber(text),
      accountNumber: text.match(/\bAccount\s+No\s*:\s*(\d{10})\b/i)?.[1] ?? null,
      dueDate: unifiDueDate(text),
    };
  } finally {
    await task.destroy().catch(() => {});
  }
}
