// @vitest-environment node
import { PDFDocument } from 'pdf-lib';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  filter: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  gateway: vi.fn(),
  invoice: vi.fn(),
  attachment: vi.fn(),
}));

vi.mock('./supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mocks.claim,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }),
      update: (value: Record<string, unknown>) => {
        mocks.update(value);
        const filters = {
          eq: (key: string, value: string) => {
            mocks.filter(key, value);
            return filters;
          },
          select: () => ({ maybeSingle: mocks.save }),
        };
        return filters;
      },
    }),
  }),
}));
vi.mock('./billing-mail', () => ({ gmailGateway: mocks.gateway }));
vi.mock('./unifi-invoices', () => ({
  getUnifiInvoice: mocks.invoice,
  downloadUnifiInvoice: mocks.attachment,
}));

import { dispatchUnifiInvoiceMail } from './unifi-invoice-mail';

const invoiceId = '11111111-1111-4111-8111-111111111111';
const sentAt = '2026-11-13T07:00:00.000Z';
const sender = 'klgcr.noreply@gmail.com';
const joey = 'account1@keanlenggroup.com';
let firstPage: Uint8Array;

beforeEach(async () => {
  vi.resetAllMocks();
  const pdf = await PDFDocument.create();
  pdf.addPage();
  firstPage = await pdf.save();
  mocks.claim.mockResolvedValue({ data: 'pending', error: null });
  mocks.invoice.mockResolvedValue({
    review_stage: 'approved', james_approved_at: sentAt, period: '2026-11',
    line_number: 3, invoice_number: 'INV100', due_date: '2026-11-25',
  });
  mocks.attachment.mockResolvedValue({ bytes: firstPage, fileName: 'INV100.pdf' });
  mocks.save.mockImplementation(async () => ({
    data: { invoice_id: invoiceId, ...mocks.update.mock.calls.at(-1)?.[0] },
    error: null,
  }));
  mocks.gateway.mockImplementation(async ({ key }: { key: string }) => ({
    ok: true, status: 'sent', sender, to: joey, sentAt, key,
  }));
});

it('emails the archived first page only to Joey after approval and persists the confirmed send', async () => {
  expect(await dispatchUnifiInvoiceMail(invoiceId)).toMatchObject({ status: 'sent', sent_at: sentAt, error: null });
  expect(mocks.claim).toHaveBeenCalledWith('claim_unifi_invoice_delivery', {
    p_invoice_id: invoiceId, p_claim_token: expect.any(String),
  });
  const [message] = mocks.gateway.mock.calls[0];
  expect(message).toMatchObject({
    action: 'finance-send', from: sender, to: joey,
    key: expect.stringMatching(/^invoice_[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    fileName: 'INV100.pdf', pdfBase64: Buffer.from(firstPage).toString('base64'),
  });
  expect(message).not.toHaveProperty('cc');
  expect(mocks.update).toHaveBeenCalledWith({
    status: 'sent', sent_at: sentAt, error: null, locked_until: null, claim_token: null,
  });
  expect(mocks.filter).toHaveBeenCalledWith('claim_token', mocks.claim.mock.calls[0][1].p_claim_token);
});

it('skips archived or unapproved invoices, an active lease, and completed delivery', async () => {
  mocks.claim.mockResolvedValue({ data: null, error: null });
  for (const data of [null, { status: 'sending' }, { status: 'sent' }]) {
    mocks.read.mockResolvedValue({ data, error: null });
    expect(await dispatchUnifiInvoiceMail(invoiceId)).toEqual(data);
  }
  expect(mocks.gateway).not.toHaveBeenCalled();
  expect(mocks.invoice).not.toHaveBeenCalled();
});

it('recovers a gateway receipt after an unsuccessful save using the same delivery key', async () => {
  mocks.save.mockResolvedValueOnce({ data: null, error: Error('db') });
  await expect(dispatchUnifiInvoiceMail(invoiceId)).rejects.toThrow('Unable to save');
  mocks.claim.mockResolvedValue({ data: 'sending', error: null });
  expect(await dispatchUnifiInvoiceMail(invoiceId)).toMatchObject({ status: 'sent' });
  expect(mocks.gateway.mock.calls[0][0].key).toBe(mocks.gateway.mock.calls[1][0].key);
});

it('keeps uncertainty if Gmail times out or a later check cannot confirm delivery', async () => {
  mocks.gateway.mockRejectedValueOnce(Error('gateway timeout')).mockResolvedValueOnce({ status: 'rejected' });
  expect(await dispatchUnifiInvoiceMail(invoiceId)).toMatchObject({ status: 'uncertain', sent_at: null });
  mocks.claim.mockResolvedValue({ data: 'uncertain', error: null });
  expect(await dispatchUnifiInvoiceMail(invoiceId)).toMatchObject({ status: 'uncertain', sent_at: null });
});

it('refuses a PDF that contains multiple pages', async () => {
  const pdf = await PDFDocument.load(firstPage);
  pdf.addPage();
  mocks.attachment.mockResolvedValue({ bytes: await pdf.save(), fileName: 'invoice.pdf' });
  expect(await dispatchUnifiInvoiceMail(invoiceId)).toMatchObject({ status: 'failed', error: expect.stringContaining('first page') });
  expect(mocks.gateway).not.toHaveBeenCalled();
});
