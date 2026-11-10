// @vitest-environment node
import { PDFDocument, PageSizes } from 'pdf-lib';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { appendCustomerMeterPages } from './billing-customer-meter-pages';
import type { BillingLine } from './billing-preview';

it('keeps source pages, dates and previous/current evidence in the approved Excel layout', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([410, 500]).drawText('Official invoice');
  const photo = sharp({ create: { width: 40, height: 80, channels: 3, background: 'red' } });
  const jpg = await photo.clone().jpeg().toBuffer();
  const webp = await photo.clone().webp().toBuffer();
  const png = await photo.clone().png().toBuffer();
  const asDataUrl = (kind: string, bytes: Buffer) => `data:image/${kind};base64,${bytes.toString('base64')}`;
  const readings = { usage: 1, rate: 1, amount: 1, previousDate: '2025-09-01', currentDate: '2025-10-02' };
  const utility: BillingLine = {
    accountId: 'emma-omar', name: 'Example Company', billNo: 'example', amount: 3, description: '', addr: [],
    details: [
      { ...readings, unit: 'm³', label: 'WATER (m³)', prev: 2000, curr: 2001, previousPhoto: asDataUrl('webp', webp) },
      { ...readings, unit: 'kWh', label: 'ELECTRICITY (kWh)', prev: 10000, curr: 10001,
        previousPhoto: asDataUrl('jpeg', jpg), photo: asDataUrl('png', png) },
      { ...readings, unit: 'm³', label: 'Secondary water meter', prev: 11, curr: 12, currentDate: undefined },
    ],
  };
  await appendCustomerMeterPages(pdf, utility, 'Different Registry Title');
  expect(pdf.getPages().map(page => [page.getWidth(), page.getHeight()])).toEqual([[410, 500], PageSizes.A4, PageSizes.A4]);

  const bytes = await pdf.save();
  expect(Buffer.from(bytes).includes(jpg)).toBe(true);
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const load = getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false });
  try {
    const generated = await load.promise;
    const page = await generated.getPage(2);
    const { items } = await page.getTextContent();
    const text = items.flatMap(item => 'str' in item ? [item.str] : []);
    expect(text).toContain('CAFETERIA (ZIELA FOODILICIOUS)');
    expect(text).toContain('UTILITIES READING');
    expect(text.indexOf('ELECTRICITY (kWh)')).toBeLessThan(text.indexOf('WATER (m³)'));
    expect(text).toEqual(expect.arrayContaining(['1-Sep-25', '2-Oct-25', 'No photo on file']));
    expect(text.indexOf('10000')).toBeLessThan(text.indexOf('10001'));
    const [previous, current] = items.filter(item => 'str' in item && ['10000', '10001'].includes(item.str));
    if (!('transform' in previous) || !('transform' in current)) throw Error('Readings not present');
    expect(current.transform[4] - previous.transform[4]).toBeCloseTo(206);
    const ops = await page.getOperatorList();
    expect(ops.fnArray.filter(operator => operator === OPS.paintImageXObject)).toHaveLength(3);

    const continuation = await generated.getPage(3);
    const remainingText = (await continuation.getTextContent()).items.flatMap(item => 'str' in item ? [item.str] : []);
    expect(remainingText).toEqual(expect.arrayContaining(['Secondary water meter', 'Date unavailable']));
  } finally {
    await load.destroy();
  }
});
