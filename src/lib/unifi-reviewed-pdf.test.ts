// @vitest-environment node
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, it } from 'vitest';
import { unifiReviewedPdf } from './unifi-reviewed-pdf';

const signature = { strokes: [[[.1, .2], [.8, .7]] as [number, number][]] };
const review = { review_stage: 'james' as const, fikri_verified_at: null, kevin_verified_at: '2026-11-24T07:33:20Z',
  james_approved_at: null as string | null, review_signatures: { kevin: signature } };
async function invoice() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([595.28, 841.89]).drawText('Original TM Unifi invoice - INV2026112242085297', { font, size: 10, x: 30, y: 780 });
  return pdf.save();
}
async function text(bytes: Uint8Array) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true });
  try { const doc = await task.promise; return (await (await doc.getPage(1)).getTextContent()).items.map(i => 'str' in i ? i.str : '').join(' '); }
  finally { await task.destroy(); }
}
it('keeps one A4 page with the original invoice and actual verifier below it', async () => {
  const output = await unifiReviewedPdf(await invoice(), review);
  const pdf = await PDFDocument.load(output);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
  const content = await text(output);
  expect(content).toContain('INV2026112242085297');
  expect(content).toContain('Verified by Kevin');
  expect(content).not.toContain('Verified by Fikri');
  expect(content).toContain('Pending James approval');
  expect(content).toContain('15:33:20');
});
it('requires the saved approval signature for the version emailed to Joey', async () => {
  const bytes = await invoice();
  await expect(unifiReviewedPdf(bytes, { ...review, review_stage: 'approved', james_approved_at: '2026-11-24T08:00:00Z' }))
    .rejects.toThrow('signature is missing');
  const output = await unifiReviewedPdf(bytes, { ...review, review_stage: 'approved', james_approved_at: '2026-11-24T08:00:00Z',
    review_signatures: { kevin: signature, james: signature } });
  expect(await text(output)).toContain('16:00:00');
  expect(await text(output)).not.toContain('Pending James approval');
});
it('preserves the original archive and unsigned invoices', async () => {
  const bytes = await invoice();
  expect(await unifiReviewedPdf(bytes, { ...review, review_stage: 'archived' })).toBe(bytes);
  expect(await unifiReviewedPdf(bytes, { ...review, review_stage: 'verification', kevin_verified_at: null })).toBe(bytes);
});
