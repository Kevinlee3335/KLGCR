import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PaymentMailDetail, PaymentMailItem } from '@/lib/payment-mail/types';
import type { OfficialReceipt } from '@/lib/official-receipt';
import { PaymentMailVerification } from './payment-mail-verification';

vi.mock('./payment-mail-connection', () => ({ PaymentMailConnection: () => null }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const item: PaymentMailItem = {
  id: '11111111-1111-4111-8111-111111111111', mailbox: 'klgresidenceenquiry@gmail.com',
  gmail_message_id: 'gmail-1', gmail_thread_id: null, sender_email: 'remittance@untrusted.example', sender_name: 'Payment sender',
  subject: 'Payment for October invoices', body_text: 'Attached is our payment slip.', received_at: '2026-10-30T02:00:00Z',
  status: 'needs_review', suggested_company_key: 'accounts@tenant.example', suggested_company_name: 'Example Tenant Sdn Bhd',
  suggested_amount: 150, suggested_paid_on: '2026-10-30', suggested_reference: 'BANK-123', suggested_invoice_numbers: [],
  review_reasons: ['Confirm the company and bank amount.'], extraction_status: 'needs_review', extraction_details: {},
  attachment_count: 1, ingestion_completed_at: '2026-10-30T02:01:00Z', duplicate_of: null, receipt_id: null,
  verified_by: null, verified_at: null, rejected_by: null, rejected_at: null, rejection_reason: null,
  verification_details: {}, created_at: '2026-10-30T02:00:00Z', updated_at: '2026-10-30T02:00:00Z',
  attachments: [{ id: '33333333-3333-4333-8333-333333333333', message_id: '11111111-1111-4111-8111-111111111111', gmail_part_id: 'part-1', filename: 'payment.pdf', mime_type: 'application/pdf', size_bytes: 1234, content_hash: 'hash', storage_path: 'mail/proof.pdf', status: 'ready', created_at: '2026-10-30T02:01:00Z' }],
};

const detail: PaymentMailDetail = {
  item,
  companies: [{ key: 'accounts@tenant.example', email: 'accounts@tenant.example', name: 'Example Tenant Sdn Bhd', accounts: [{ kind: 'rental', account_key: '1', account_name: 'Example Tenant Sdn Bhd' }, { kind: 'utility', account_key: 'tenant', account_name: 'Example Tenant Sdn Bhd' }] }],
  invoiceOptions: [
    { run_id: '44444444-4444-4444-8444-444444444444', line_index: 0, kind: 'rental', period: '2026-09', issue_date: '2026-09-01', created_at: '2026-09-01', account_key: '1', account_name: 'Example Tenant Sdn Bhd', bill_no: 'RENT-SEP', amount: 120, description: 'September rent', approved_at: '2026-09-01', approved_by: 'James', paid: 20, balance: 100 },
    { run_id: '55555555-5555-4555-8555-555555555555', line_index: 1, kind: 'utility', period: '2026-10', issue_date: '2026-10-01', created_at: '2026-10-01', account_key: 'tenant', account_name: 'Example Tenant Sdn Bhd', bill_no: 'UTIL-OCT', amount: 80, description: 'October utilities', approved_at: '2026-10-01', approved_by: 'James', paid: 0, balance: 80 },
  ],
  receipt: null,
};

const receipt: OfficialReceipt = { id: '66666666-6666-4666-8666-666666666666', receipt_no: 'KLGCR/260123', kind: 'rental', paid_on: '2026-10-30', payer: 'Example Tenant Sdn Bhd', email: 'accounts@tenant.example', amount: 150, description: 'Rental Sep and Utilities Oct', bank_reference: 'BANK-123', proof_path: 'mail/proof.pdf', emailed_at: '2026-11-10T04:00:00Z', email_error: null };

function mockApi(selectedDetail = detail) {
  let verified = false;
  const actions: Record<string, unknown>[] = [];
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const body = JSON.parse(String(options.body)); actions.push(body); verified = true;
      return new Response(JSON.stringify({ ok: true, item: { ...selectedDetail.item, status: 'verified', verified_at: '2026-11-10T04:00:00Z' }, receipt, mail: 'sent' }));
    }
    if (url.startsWith('/api/payment-mail/receipts?')) {
      return new Response(JSON.stringify({ items: [{ ...receipt, verifier_name: 'Example Admin' }], total: 1 }));
    }
    if (url.includes('?id=')) return new Response(JSON.stringify(selectedDetail));
    return new Response(JSON.stringify({ items: verified ? [] : [selectedDetail.item], total: verified ? 0 : 1 }));
  });
  vi.stubGlobal('fetch', fetcher);
  return { actions, fetcher };
}

async function preparePayment() {
  render(<PaymentMailVerification initialId={item.id} />);
  await screen.findByRole('heading', { name: 'Confirm bank payment & invoices' });
  expect(screen.getByRole('region', { name: 'Selected payment email' })).toHaveFocus();
  const amount = screen.getByRole('spinbutton', { name: 'Actual amount received (RM)' });
  expect(amount).toHaveValue(null);
  fireEvent.change(amount, { target: { value: '150.00' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Select.*Rental.*RENT-SEP/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Select.*Utilities.*UTIL-OCT/ }));
}

it('requires explicit bank and company confirmation, supports cross-month partial allocation, and preserves review inputs during inbox refresh', async () => {
  const { fetcher } = mockApi();
  await preparePayment();
  expect(screen.getByRole('spinbutton', { name: 'Allocation for RENT-SEP' })).toHaveValue(100);
  expect(screen.getByRole('spinbutton', { name: 'Allocation for UTIL-OCT' })).toHaveValue(50);
  const verify = screen.getByRole('button', { name: 'Verify & Email Receipt' });
  expect(verify).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /I checked the bank account/ }));
  expect(verify).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /I confirm this payment covers/ }));
  expect(verify).toBeEnabled();
  fireEvent(window, new Event('focus'));
  await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => url.includes('status=pending')).length).toBeGreaterThan(1));
  expect(screen.getByRole('spinbutton', { name: 'Actual amount received (RM)' })).toHaveValue(150);
  expect(verify).toBeEnabled();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Allocation for UTIL-OCT' }), { target: { value: '49.00' } });
  expect(verify).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: /I checked the bank account/ })).not.toBeChecked();
  expect(screen.getByText('The invoice allocations must equal the amount received.')).toBeInTheDocument();
});

it('submits the trusted contact and exact allocations, then shows the existing Receipt when the pending email leaves the list', async () => {
  const { actions } = mockApi();
  await preparePayment();
  fireEvent.click(screen.getByRole('checkbox', { name: /I checked the bank account/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /I confirm this payment covers/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Verify & Email Receipt' }));
  await screen.findByRole('heading', { name: 'KLGCR/260123' });
  expect(actions).toEqual([expect.objectContaining({ action: 'verify', id: item.id, companyKey: 'accounts@tenant.example', amount: 150, bankReceived: true, companyConfirmed: true, proofId: item.attachments[0].id, allocations: [{ run_id: detail.invoiceOptions[0].run_id, line_index: 0, amount: 100 }, { run_id: detail.invoiceOptions[1].run_id, line_index: 1, amount: 50 }] })]);
  expect(actions[0]).not.toHaveProperty('email');
  expect(screen.queryByRole('button', { name: 'Verify & Email Receipt' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View Receipt PDF' })).toHaveAttribute('href', `/api/finance?receipt=${receipt.id}`);
  await screen.findByText('No payments awaiting verification.');
  expect(screen.getByRole('heading', { name: 'KLGCR/260123' })).toBeInTheDocument();
});

it('shows a duplicate warning and the original payment without allowing another Receipt', async () => {
  mockApi({ ...detail, item: { ...item, status: 'duplicate', duplicate_of: 'original-id' } });
  render(<PaymentMailVerification initialId={item.id} />);
  await screen.findByText('Duplicate payment proof');
  expect(screen.getByRole('button', { name: 'View original payment' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Verify & Email Receipt' })).not.toBeInTheDocument();
});

it('opens the receipt list on demand and preserves payment review input when returning to the inbox', async () => {
  const { fetcher } = mockApi();
  await preparePayment();
  expect(fetcher.mock.calls.some(([url]) => url.startsWith('/api/payment-mail/receipts?'))).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Receipt List' }));
  const pdf = await screen.findByRole('link', { name: 'View Receipt KLGCR/260123' });
  expect(pdf).toHaveAttribute('href', `/api/finance?receipt=${receipt.id}`);
  expect(screen.getByText('Example Admin')).toBeInTheDocument();
  expect(screen.getByText('Rental Sep and Utilities Oct')).toBeInTheDocument();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Receipt number or customer' }), { target: { value: 'KLGCR/260123' } });
  fireEvent.click(screen.getByRole('button', { name: /^Search$/ }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/payment-mail/receipts?page=1&q=KLGCR%2F260123', expect.anything()));
  await screen.findByRole('link', { name: 'View Receipt KLGCR/260123' });

  fireEvent.click(screen.getByRole('button', { name: /^Payment inbox$/ }));
  expect(screen.getByRole('spinbutton', { name: 'Actual amount received (RM)' })).toHaveValue(150);
});
