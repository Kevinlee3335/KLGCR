import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PaymentMailFollowUp } from './payment-mail-follow-up';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const pending = {
  id: 'payment-1', suggested_company_name: 'Example Tenant Sdn Bhd', suggested_amount: 250,
  received_at: '2026-11-01T03:00:00Z', status: 'pending_verification',
};
const response = (items: typeof pending[]) => new Response(JSON.stringify({ items, total: items.length }));

it('hides an empty reminder and shows newly received payments on the next refresh, including unresolved older dates', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([pending]));
  vi.stubGlobal('fetch', fetcher);
  render(<PaymentMailFollowUp />);
  await act(async () => {});
  expect(screen.queryByRole('region', { name: 'Payment Verification' })).not.toBeInTheDocument();
  await act(async () => { vi.advanceTimersByTime(30_000); });
  expect(screen.getByRole('region', { name: 'Payment Verification' })).toBeInTheDocument();
  expect(screen.getByText('Example Tenant Sdn Bhd')).toBeInTheDocument();
  expect(screen.getByText(/Suggested.*250.00/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Verify/ })).toHaveAttribute('href', '/admin/payment-verification?id=payment-1');
  expect(fetcher.mock.calls[0][0]).toBe('/api/payment-mail?status=pending&limit=10');
});

it('retains pending rows and reports a refresh failure instead of showing an empty queue', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response([pending])).mockRejectedValueOnce(new Error('Offline')));
  render(<PaymentMailFollowUp />);
  await act(async () => {});
  await act(async () => { vi.advanceTimersByTime(30_000); });
  expect(screen.getByText('Example Tenant Sdn Bhd')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Payment reminders could not refresh');
});
