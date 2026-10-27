// @vitest-environment node
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, it } from 'vitest';
import { extractSupplierPdfText } from './pdf-text';
it('extracts actual line items and flags a scanned/empty page for OCR', async () => {
  const doc=await PDFDocument.create();
  const font=await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText('Replace hose reel nozzle, unit price RM 1288.00', {font});
  const result=await extractSupplierPdfText(await doc.save());
  expect(result.text_extraction_status).toBe('ready');
  expect(result.content_text).toContain('hose reel nozzle');
  const scan=await PDFDocument.create();scan.addPage();
  expect((await extractSupplierPdfText(await scan.save())).text_extraction_status).toBe('needs_ocr');
},20000);
