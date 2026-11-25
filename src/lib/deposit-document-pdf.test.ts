// @vitest-environment node
import {expect, it} from 'vitest';
import {decodePDFRawStream, PDFDocument, PDFHexString, PDFName, PDFRawStream} from 'pdf-lib';
import {depositReceiptPdf, paymentVoucherPdf, type PaymentVoucherPdfData} from './deposit-document-pdf';
import {companySealDataUrl} from './company-seal';
import type {Signature} from './purchase-orders/signature';

const signature: Signature = {strokes: [[[.12, .15], [.4, .9], [.8, .25]], [[.2, .4], [.6, .45]]]};
const voucher: PaymentVoucherPdfData = {
  voucher_no: 'KLGPV-2600001', payer: 'JOSÉ MUHAMMAD BIN ABDULLAH', member_reference: 'GYM26-0001', amount: 10,
  paid_on: '2026-11-25', refunded_by_name: 'KEVIN LEE', refund_signature: signature, original_receipt_no: 'KLGDR-2600001',
};

async function content(bytes: Buffer) {
  const {getDocument} = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true});
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const text = await page.getTextContent();
    return text.items.flatMap(item => 'str' in item ? [item.str] : []).join(' ');
  } finally {
    await doc.destroy();
  }
}

async function embeddedStreams(bytes: Buffer) {
  const pdf = await PDFDocument.load(bytes);
  return pdf.context.enumerateIndirectObjects().flatMap(([, object]) => object instanceof PDFRawStream
    ? [{dictionary: object.dict, bytes: decodePDFRawStream(object).decode()}] : []);
}

it('renders the approved signed PV on one A5 landscape page without a recipient acknowledgement or refund timestamp', async () => {
  const bytes = await paymentVoucherPdf(voucher);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.2756, 3);
  expect(pdf.getPage(0).getHeight()).toBeCloseTo(419.5276, 3);
  const text = await content(bytes);
  expect(text).toContain('KLGPV-2600001');
  expect(text).toContain('KLGDR-2600001');
  expect(text).toContain("The recipient's signature is not required for this payment voucher.");
  expect(text).toContain('Refunded by:');
  expect(text).toContain('KEVIN LEE');
  expect(text).toContain('JOSÉ MUHAMMAD BIN ABDULLAH');
  expect(text).toContain('25 Nov 2026');
  expect(text).not.toMatch(/Refund date|MYT|Confirmed at|I confirm|Sample|SAMPLE/);
});

it('preserves long Unicode names and member references rather than stripping their characters', async () => {
  const payer = 'José Łukasz Nguyễn '.repeat(7).trim();
  const text = await content(await paymentVoucherPdf({...voucher, payer, member_reference: 'NONRESIDENT-2026-REGISTER-00000123456789'}));
  expect(text.replace(/\s+/g, '')).toContain(payer.replace(/\s+/g, ''));
  expect(text).toContain('Łukasz');
  expect(text).toContain('Nguyễn');
});

it('embeds offline CJK fallback fonts for Chinese, Japanese and Korean names including supplementary name characters', async () => {
  const payer = '陈伟 李小龍 𠮷田 ハル 김민준 / CHAN WEI';
  const bytes = await paymentVoucherPdf({...voucher, payer, refunded_by_name: 'KEVIN 李'});
  const text = await content(bytes);
  expect(text.replace(/\s+/g, '')).toContain(payer.replace(/\s+/g, ''));
  expect(text.replace(/\s+/g, '')).toContain('KEVIN李');
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  expect(bytes.byteLength).toBeLessThan(1_000_000);
  const cff = (await embeddedStreams(bytes)).find(stream => stream.dictionary.get(PDFName.of('Subtype'))?.toString() === '/CIDFontType0C');
  expect(cff).toBeDefined();
  // A fontkit bug used the source dictionary length (27) here. Viewers reject
  // that invalid CFF header even when the ToUnicode text still extracts.
  expect(cff!.bytes[0]).toBe(1);
  expect(cff!.bytes[3]).toBeGreaterThanOrEqual(1);
  expect(cff!.bytes[3]).toBeLessThanOrEqual(4);
}, 15000);

it('preserves mixed Tamil and Latin names with shaped grapheme clusters and long-name wrapping', async () => {
  const payer = 'ஜெயக்குமார் ARUN ஜெயஸ்ரீ '.repeat(4).trim();
  const bytes = await depositReceiptPdf({receipt_no: 'KLGDR-2600003', payer, member_reference: 'GYM26-0003',
    amount: 10, received_on: '2026-11-25', received_by_name: 'KEVIN LEE', issuer_signature: signature});
  const text = await content(bytes);
  expect(text.match(/ARUN/g)).toHaveLength(4);
  // PDF.js ignores standard ActualText and reports Tamil pre-base vowels in
  // visual order. Assert the logical name in the PDF's semantic replacement
  // text instead; Poppler and MuPDF extract these syllable spans correctly.
  const actualText = (await embeddedStreams(bytes)).flatMap(stream => {
    const decoded = Buffer.from(stream.bytes).toString('latin1');
    return [...decoded.matchAll(/\/ActualText\s+<([\da-f]+)>/gi)].map(match => PDFHexString.of(match[1]).decodeText());
  }).join('');
  expect(actualText).toBe(payer.replace(/ARUN|\s+/g, ''));
  expect(actualText).toContain('ஸ்ரீ');
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  expect(bytes.byteLength).toBeLessThan(1_000_000);
});

it.each(['W', '陳'])('fits a 200-character %s name on one A5 voucher', async character => {
  const payer = character.repeat(200);
  const bytes = await paymentVoucherPdf({...voucher, payer});
  expect((await content(bytes)).replace(/\s+/g, '')).toContain(payer);
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
}, 15000);

it('renders a refundable cash deposit receipt independently from membership fees', async () => {
  const bytes = await depositReceiptPdf({receipt_no: 'KLGDR-2600001', payer: 'MEMBER NAME', member_reference: 'GYM26-0001',
    amount: 10, received_on: '2026-11-25', received_by_name: 'FIKRI', issuer_signature: signature});
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);
  const text = await content(bytes);
  expect(text).toContain('DEPOSIT RECEIPT');
  expect(text).toContain('KLGDR-2600001');
  expect(text).toContain('Refundable gym deposit - Cash');
  expect(text).toContain('Deposit held separately from the RM40 membership fee.');
  expect(text).toContain('Received by:');
  expect(text).toContain('FIKRI');
  expect(text).not.toContain('BANK TRANSFER');
});

it('labels historical deposits without claiming to receive new cash or issue a new receipt', async () => {
  const text = await content(await depositReceiptPdf({receipt_no: 'OLD-HANDWRITTEN-039', original_receipt_no: 'OLD-HANDWRITTEN-039',
    payer: 'LEGACY MEMBER', member_reference: 'GYM26-0099', amount: 10, received_on: '2025-09-07', received_by_name: 'KEVIN LEE', origin: 'existing'}));
  expect(text).toContain('EXISTING DEPOSIT RECORD');
  expect(text).toContain('OLD-HANDWRITTEN-039');
  expect(text).toContain('07 Sept 2025');
  expect(text).toContain('No new cash collection.');
  expect(text).toContain('not a newly issued cash receipt.');
  expect(text).toContain('Recorded by:');
});

it('accepts image signature snapshots and rejects an empty or invalid refund signature', async () => {
  const bytes = await paymentVoucherPdf({...voucher, refund_signature: {strokes: [], imageDataUrl: companySealDataUrl}});
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  await expect(paymentVoucherPdf({...voucher, refund_signature: {strokes: []}})).rejects.toThrow('staff signature is required');
  await expect(paymentVoucherPdf({...voucher, original_receipt_no: ''})).rejects.toThrow('original deposit receipt');
  await expect(paymentVoucherPdf({...voucher, paid_on: '2026-02-30'})).rejects.toThrow('Invalid document date');
  await expect(paymentVoucherPdf({...voucher, amount: Number.NaN})).rejects.toThrow('Invalid document amount');
});
