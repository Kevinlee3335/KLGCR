import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { companySealDataUrl } from './company-seal';
import { signaturePhotoBounds } from './signature-image-layout';
import { signatureSchema } from './purchase-orders/signature';
import type { UnifiInvoice } from './unifi-invoices';

type Review = Pick<UnifiInvoice, 'review_stage' | 'fikri_verified_at' | 'kevin_verified_at' | 'james_approved_at' | 'review_signatures'>;

export async function unifiReviewedPdf(bytes: Uint8Array, invoice: Review) {
  if (invoice.review_stage === 'archived') return bytes;
  const verifiers = [
    { key: 'fikri' as const, name: 'Fikri', at: invoice.fikri_verified_at },
    { key: 'kevin' as const, name: 'Kevin', at: invoice.kevin_verified_at },
  ].filter(entry => entry.at).sort((a, b) => a.at!.localeCompare(b.at!));
  const verifier = verifiers[0];
  if (!verifier && !invoice.james_approved_at) return bytes;
  if (!verifier) throw Error('The invoice verification is missing.');

  const pdf = await PDFDocument.create({ updateMetadata: false });
  const source = await PDFDocument.load(bytes, { updateMetadata: false });
  if (source.getPageCount() !== 1) throw Error('Only the invoice first page may be reviewed.');
  const { width, height } = source.getPage(0).getSize();
  const page = pdf.addPage([width, height]);
  const embedded = await pdf.embedPage(source.getPage(0));
  const footer = 118;
  const scale = Math.min(1, (height - footer) / height);
  page.drawPage(embedded, { x: (width - width * scale) / 2, y: footer, width: width * scale, height: height * scale });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(.08, .12, .18), border = rgb(.7, .65, .53);
  const margin = 36, cellWidth = (width - margin * 2) / 2;
  page.drawLine({ start: { x: margin, y: 110 }, end: { x: width - margin, y: 110 }, color: border, thickness: .6 });
  const slots = [
    { key: verifier.key, label: `Verified by ${verifier.name}`, at: verifier.at },
    { key: 'james' as const, label: 'Approved by James', at: invoice.james_approved_at },
  ];
  for (const [index, slot] of slots.entries()) {
    const x = margin + index * cellWidth;
    page.drawText(slot.label, { x, y: 94, size: 10, font: bold, color: ink });
    if (slot.at) {
      const parsed = signatureSchema.safeParse(invoice.review_signatures?.[slot.key]);
      if (!parsed.success) throw Error('The saved review signature is missing.');
      const signature = parsed.data;
      const sigWidth = Math.min(155, cellWidth - 74), sigHeight = 44, baseY = 38;
      if (signature.imageDataUrl) {
        const bounds = signaturePhotoBounds(signature.imageDataUrl);
        const image = await pdf.embedPng(signature.imageDataUrl);
        const ratio = Math.min(sigWidth / bounds.width, sigHeight / bounds.height);
        page.drawImage(image, {
          x: x + sigWidth / 2 - (bounds.left + bounds.width / 2) * ratio,
          y: baseY - (bounds.imageHeight - bounds.top - bounds.height) * ratio,
          width: bounds.imageWidth * ratio, height: bounds.imageHeight * ratio,
        });
      } else for (const stroke of signature.strokes) for (let n = 1; n < stroke.length; n++) {
        const point = ([px, py]: number[]) => ({ x: x + px * sigWidth, y: baseY + (1 - py) * sigHeight });
        page.drawLine({ start: point(stroke[n - 1]), end: point(stroke[n]), thickness: 1.2, color: ink });
      }
      page.drawImage(await pdf.embedPng(companySealDataUrl), { x: x + cellWidth - 70, y: 36, width: 45, height: 45 });
      page.drawText(new Date(slot.at).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour12: false }) + ' MYT',
        { x, y: 17, size: 8, font: regular, color: ink });
    } else {
      page.drawText('Pending James approval', { x, y: 54, size: 9, font: regular, color: ink });
    }
    page.drawLine({ start: { x, y: 30 }, end: { x: x + cellWidth - 22, y: 30 }, color: border, thickness: .5 });
  }
  return pdf.save();
}
