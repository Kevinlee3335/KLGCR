import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PaymentMailConnection } from './payment-mail-connection';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([
  { label: 'new mail', firstImport: '0', expectedStart: { lookbackDays: 0 }, enabledFrom: '2026-11-10T04:00:00Z' },
  { label: 'November catch-up', firstImport: '2026-11-01', expectedStart: { startFrom: '2026-11-01' }, enabledFrom: '2026-10-31T16:00:00Z' },
])('keeps a $label key disconnected and masked until a successful mailbox heartbeat', async ({ firstImport, expectedStart, enabledFrom }) => {
  let heartbeat = false;
  const payloads: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    if (options?.method === 'POST') {
      payloads.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ ok: true, token: 'a'.repeat(64), id: 'connection-1', origin: 'https://example.test', enabledFrom, mailbox: 'klgresidenceenquiry@gmail.com' }));
    }
    return new Response(JSON.stringify({ mailbox: 'klgresidenceenquiry@gmail.com', connections: [], ready: heartbeat, status: heartbeat ? 'connected' : 'not_connected', senders: [], scriptUrl: '/payment-mail/sync.gs', manifestUrl: '/payment-mail/appsscript.json' }));
  }));
  render(<PaymentMailConnection />);
  await screen.findByText('Not connected');
  fireEvent.click(screen.getByText('Email connection'));
  if (firstImport !== '0') fireEvent.change(screen.getByLabelText('First import'), { target: { value: firstImport } });
  fireEvent.click(screen.getByRole('button', { name: 'Create installation key' }));
  await screen.findByRole('heading', { name: 'Install the payment email importer' });
  expect(payloads).toEqual([{ action: 'create', ...expectedStart }]);
  expect(screen.getByLabelText('KLGCR_PAYMENT_MAIL_TOKEN')).toHaveAttribute('type', 'password');
  expect(screen.getByText('Not connected')).toBeInTheDocument();
  heartbeat = true;
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check connection' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Check connection' }));
  await screen.findByText('Connected');
});
