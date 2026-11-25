import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {GymDepositPanel, type GymDepositListResponse, type GymDepositReceipt, type GymPaymentVoucher} from './gym-deposit-panel';

vi.mock('./signature-pad', () => ({SignaturePad: () => <div>My saved signature editor</div>}));

const member = {id: '00000000-0000-4000-8000-000000000010', name: 'TEST MEMBER', memberType: 'outsider'};
const receipt: GymDepositReceipt = {
  id: '00000000-0000-4000-8000-000000000011', receipt_no: 'KLGDR-2600001', source_module: 'gym', member_id: member.id,
  payer: member.name, email: 'member@example.com', member_reference: 'GYM26-0001', amount: 10, received_on: '2026-11-25',
  received_by_name: 'Liza', origin: 'received', original_receipt_no: null, note: null, status: 'held',
  created_at: '2026-11-25T04:00:00Z', pdf_ready: true, pdf_error: null, email_status: 'sent', email_error: null, emailed_at: '2026-11-25T04:01:00Z',
};
const voucher: GymPaymentVoucher = {
  id: '00000000-0000-4000-8000-000000000012', voucher_no: 'KLGPV-2600001', member_id: member.id, origin: 'deposit_refund', deposit_receipt_id: receipt.id,
  payer: member.name, email: receipt.email, member_reference: receipt.member_reference, amount: 10,
  paid_on: '2026-11-25', refunded_by_name: 'Kevin Lee', original_receipt_no: receipt.receipt_no,
  created_at: '2026-11-25T05:00:00Z', pdf_ready: true, pdf_error: null, email_status: 'failed', email_error: 'Email gateway unavailable', emailed_at: null,
};

function result(overrides: Partial<GymDepositListResponse> = {}): GymDepositListResponse {
  return {
    receipts: [receipt], vouchers: [], receiptCount: 1, voucherCount: 0, signatureReady: true, actorName: 'Kevin Lee', canManage: true,
    summary: {receivedAmount: 10, openingAmount: 0, refundedAmount: 0, heldAmount: 10, heldCount: 1}, memberHasHeldDeposit: true,
    hasDepositHistory: true, legacyRefunded: false, newDepositsAvailable: true, depositStartDate: '2026-12-01',
    ...overrides,
  };
}

const response = (body: unknown, ok = true) => ({ok, json: async () => body});
const fetchMock = vi.fn();
beforeEach(() => {vi.stubGlobal('fetch', fetchMock); vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-12-02T04:00:00Z').getTime());});
afterEach(() => {cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks();});

it('shows saved documents but no cash or email actions in read-only mode', async () => {
  fetchMock.mockResolvedValue(response(result()));
  render(<GymDepositPanel member={member} readOnly/>);
  expect(await screen.findByText('KLGDR-2600001')).toBeInTheDocument();
  expect(screen.getByRole('link', {name: 'View receipt KLGDR-2600001'})).toHaveAttribute('href', `/api/gym-deposits/receipt/${receipt.id}/pdf`);
  expect(screen.queryByRole('button', {name: /Record RM10 refund/})).not.toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Receive RM10 cash deposit'})).not.toBeInTheDocument();
  expect(screen.queryByText('My saved signature editor')).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});

it('requires the actual staff saved signature and checks readiness again after setup', async () => {
  let signatureReady = false;
  fetchMock.mockImplementation(async () => response(result({signatureReady})));
  render(<GymDepositPanel member={member}/>);
  expect(await screen.findByText('My saved signature editor')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: /Record RM10 refund/})).toBeDisabled();
  signatureReady = true;
  fireEvent.click(screen.getByRole('button', {name: 'Check saved signature'}));
  await waitFor(() => expect(screen.getByRole('button', {name: /Record RM10 refund/})).toBeEnabled());
  expect(screen.queryByRole('link', {name: 'My Account'})).not.toBeInTheDocument();
});

it('blocks a second deposit even when the held record is off the current page', async () => {
  fetchMock.mockResolvedValue(response(result({receipts: [], receiptCount: 50, memberHasHeldDeposit: true})));
  render(<GymDepositPanel member={member}/>);
  expect(await screen.findByText('Deposit Already Held')).toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Receive RM10 cash deposit'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Record existing deposit'})).not.toBeInTheDocument();
});

it('retains the collection request id after a failure and succeeds on retry', async () => {
  let submissions = 0;
  fetchMock.mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') return ++submissions === 1 ? response({error: 'Network interrupted. Please retry.'}, false) : response({ok: true, id: receipt.id, receipt_no: receipt.receipt_no});
    return response(result({receipts: [], receiptCount: 0, memberHasHeldDeposit: false}));
  });
  render(<GymDepositPanel member={member}/>);
  fireEvent.click(await screen.findByRole('button', {name: 'Receive RM10 cash deposit'}));
  fireEvent.click(screen.getByRole('button', {name: 'Record cash & issue receipt'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Network interrupted. Please retry.');
  fireEvent.click(screen.getByRole('button', {name: 'Record cash & issue receipt'}));
  await screen.findByText(/KLGDR-2600001 saved/);
  const requests = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(init.body));
  expect(requests).toHaveLength(2);
  expect(requests[1].request_id).toBe(requests[0].request_id);
  expect(requests[0]).toMatchObject({action: 'receive', member_id: member.id, origin: 'received'});
  expect(requests[0]).not.toHaveProperty('original_receipt_no');
});

it('refunds an old handwritten deposit directly with a stable retry id and no receipt prerecording', async () => {
  let attempts = 0, refunded = false;
  const legacyVoucher: GymPaymentVoucher = {...voucher, origin: 'legacy_refund', deposit_receipt_id: null, original_receipt_no: null};
  fetchMock.mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') {
      if (++attempts === 1) return response({error: 'Network interrupted. Please retry.'}, false);
      refunded = true;
      return response({ok: true, voucher_no: legacyVoucher.voucher_no});
    }
    return response(result({receipts: [], receiptCount: 0, vouchers: refunded ? [legacyVoucher] : [], voucherCount: refunded ? 1 : 0, memberHasHeldDeposit: false, hasDepositHistory: false, legacyRefunded: refunded}));
  });
  render(<GymDepositPanel member={{...member, memberType: 'resident'}}/>);
  const refundButton = await screen.findByRole('button', {name: 'Refund old handwritten deposit'});
  expect(screen.queryByRole('button', {name: 'Receive RM10 cash deposit'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Record existing deposit'})).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Original Deposit Receipt No.')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Original collection date')).not.toBeInTheDocument();
  fireEvent.click(refundButton);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', {name: 'Refund old handwritten deposit'}));
  await screen.findByText('Old handwritten deposit refund');
  const requests = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(init.body));
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual({action: 'refund_legacy', request_id: expect.any(String), member_id: member.id});
  expect(requests[1].request_id).toBe(requests[0].request_id);
  expect(screen.queryByRole('button', {name: 'Refund old handwritten deposit'})).not.toBeInTheDocument();
  expect(screen.queryByRole('link', {name: /KLGDR/})).not.toBeInTheDocument();
});

it('disables new receipt collection until December while old handwritten refunds remain available', async () => {
  vi.mocked(Date.now).mockReturnValue(new Date('2026-11-25T04:00:00Z').getTime());
  fetchMock.mockResolvedValue(response(result({receipts: [], receiptCount: 0, memberHasHeldDeposit: false, hasDepositHistory: false, newDepositsAvailable: false})));
  render(<GymDepositPanel member={member}/>);
  expect(await screen.findByRole('button', {name: 'Receive RM10 cash deposit'})).toBeDisabled();
  expect(screen.getByText('New deposit receipts start on 1 Dec 2026.')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Refund old handwritten deposit'})).toBeEnabled();
  fireEvent.click(screen.getByRole('button', {name: 'Receive RM10 cash deposit'}));
  expect(screen.queryByRole('button', {name: 'Record cash & issue receipt'})).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});

it('guards direct legacy refunds with staff signature and complete history independent of current filters', async () => {
  fetchMock.mockResolvedValue(response(result({receipts: [], receiptCount: 0, memberHasHeldDeposit: false, hasDepositHistory: false, signatureReady: false})));
  const view = render(<GymDepositPanel member={member}/>);
  expect(await screen.findByRole('button', {name: 'Refund old handwritten deposit'})).toBeDisabled();
  expect(screen.getByText('My saved signature editor')).toBeInTheDocument();
  view.unmount();
  fetchMock.mockResolvedValue(response(result({receipts: [], receiptCount: 0, voucherCount: 0, memberHasHeldDeposit: false, hasDepositHistory: true, signatureReady: true})));
  render(<GymDepositPanel member={member}/>);
  await screen.findByText('No deposit receipt is recorded for this member.');
  expect(screen.queryByRole('button', {name: 'Refund old handwritten deposit'})).not.toBeInTheDocument();
});

it('records a refund with no member acknowledgment and keeps the refunded state if email fails', async () => {
  let refunded = false;
  fetchMock.mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') {refunded = true; return response({ok: true, document: {id: voucher.id, number: voucher.voucher_no, kind: 'voucher'}, message: 'Refund recorded. Email delivery needs retry.'});}
    return response(refunded ? result({receipts: [{...receipt, status: 'refunded'}], vouchers: [voucher], voucherCount: 1, memberHasHeldDeposit: false}) : result());
  });
  render(<GymDepositPanel member={member}/>);
  fireEvent.click(await screen.findByRole('button', {name: /Record RM10 refund/}));
  await screen.findByText('Refund recorded. Email delivery needs retry.');
  expect(await screen.findByText('Refunded')).toBeInTheDocument();
  expect(screen.queryByRole('button', {name: /Record RM10 refund/})).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  const payload = JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body);
  expect(payload).toEqual({action: 'refund', request_id: expect.any(String), deposit_id: receipt.id});
  fireEvent.click(screen.getByRole('tab', {name: /Payment Vouchers/}));
  expect(await screen.findByText('Email failed')).toBeInTheDocument();
  expect(screen.getByText('Kevin Lee')).toBeInTheDocument();
  expect(screen.getByRole('link', {name: 'View PV KLGPV-2600001'})).toHaveAttribute('href', `/api/gym-deposits/voucher/${voucher.id}/pdf`);
});

it('retries failed email delivery using the original document and no new refund action', async () => {
  fetchMock.mockImplementation(async (_url, init) => init?.method === 'POST' ? response({ok: true, document: {id: voucher.id, number: voucher.voucher_no, kind: 'voucher'}, message: 'Email retried.'}) : response(result({receipts: [{...receipt, status: 'refunded'}], vouchers: [voucher], voucherCount: 1, memberHasHeldDeposit: false})));
  render(<GymDepositPanel initialKind="vouchers"/>);
  fireEvent.click(await screen.findByRole('button', {name: 'Retry email'}));
  await screen.findByText('Email retried.');
  const payload = JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body);
  expect(payload).toEqual({action: 'resend', document_kind: 'voucher', id: voucher.id});
});

it('reports the original refunding employee after a stale refund attempt and links a PV outside voucher pagination', async () => {
  let refunded = false;
  fetchMock.mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') {refunded = true; return response({ok: true, already_refunded: true, voucher_no: 'KLGPV-2600008', refunded_by_name: 'Fikri'});}
    return response(refunded ? result({receipts: [{...receipt, status: 'refunded', voucher_id: voucher.id, voucher_no: 'KLGPV-2600008'}], vouchers: [], voucherCount: 80, memberHasHeldDeposit: false}) : result());
  });
  render(<GymDepositPanel member={member}/>);
  fireEvent.click(await screen.findByRole('button', {name: /Record RM10 refund/}));
  expect(await screen.findByText(/already refunded by Fikri/)).toHaveTextContent('Original PV: KLGPV-2600008. No new refund was recorded.');
  expect(await screen.findByRole('link', {name: 'PV: KLGPV-2600008'})).toHaveAttribute('href', `/api/gym-deposits/voucher/${voucher.id}/pdf`);
  expect(screen.queryByRole('button', {name: /Record RM10 refund/})).not.toBeInTheDocument();
});

it('recovers after a list load error without any POST requests', async () => {
  let attempts = 0;
  fetchMock.mockImplementation(async () => ++attempts === 1 ? response({error: 'Unable to load deposits.'}, false) : response(result()));
  render(<GymDepositPanel/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load deposits.');
  fireEvent.click(screen.getByRole('button', {name: 'Try again'}));
  expect(await screen.findByText('KLGDR-2600001')).toBeInTheDocument();
  expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});

it('submits global search filters and keeps collection member-bound', async () => {
  fetchMock.mockResolvedValue(response(result()));
  render(<GymDepositPanel/>);
  await screen.findByText('KLGDR-2600001');
  expect(screen.getByRole('link', {name: 'choose a member in Membership'})).toHaveAttribute('href', '/admin/members');
  fireEvent.change(screen.getByLabelText('Name, member or document number'), {target: {value: 'GYM26-0001'}});
  fireEvent.change(screen.getByLabelText('From'), {target: {value: '2026-11-01'}});
  fireEvent.change(screen.getByLabelText('To'), {target: {value: '2026-11-30'}});
  fireEvent.change(screen.getByLabelText('Deposit status'), {target: {value: 'held'}});
  fireEvent.click(screen.getByRole('button', {name: 'Search'}));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('q=GYM26-0001'))).toBe(true));
  const lastUrl = String(fetchMock.mock.calls.at(-1)![0]);
  const params = new URL(lastUrl, 'https://example.com').searchParams;
  expect(Object.fromEntries(params.entries())).toMatchObject({kind: 'receipts', page: '1', q: 'GYM26-0001', from: '2026-11-01', to: '2026-11-30', status: 'held'});
});
