// @vitest-environment node
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, it } from 'vitest';
import { unifiBillingMonth, unifiFirstPage, unifiInvoiceDetails } from './unifi-invoice-pdf';

it('reads the billing month from an actual bill subject and ignores reminders and receipts', () => {
  expect(unifiBillingMonth('Your Unifi bill for Oct 2026 is ready! (Account No: 1234567890)')).toBe('2026-10');
  expect(unifiBillingMonth('YOUR UNIFI BILL IS ALMOST DUE')).toBeNull();
  expect(unifiBillingMonth('Payment Receipt')).toBeNull();
});

it('saves exactly the first page with the invoice details and a stable file hash', async () => {
  const original = await PDFDocument.create();
  const font = await original.embedFont(StandardFonts.Helvetica);
  const first = original.addPage();
  first.drawText('Here is a summary of your Nov-2026 Unifi bill.', { font });
  first.drawText('Bill No: INV123456', { font, y: 600 });
  first.drawText('Account No: 1234567890', { font, y: 500 });
  first.drawText('(Pay before 1 Dec 2026)', { font, y: 400 });
  original.addPage().drawText('Do not archive this page', { font });
  const bytes = await original.save();
  const page = await unifiFirstPage(bytes);

  expect((await PDFDocument.load(page)).getPageCount()).toBe(1);
  expect(await unifiInvoiceDetails(page)).toEqual({
    period: '2026-11', invoiceNumber: 'INV123456', accountNumber: '1234567890', dueDate: '2026-12-01',
  });
  expect(await unifiFirstPage(bytes)).toEqual(page);
  await expect(unifiFirstPage(new Uint8Array())).rejects.toThrow('Choose a valid TM Unifi PDF');
});
