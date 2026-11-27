import type { ReactNode } from 'react';
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import Page from './page';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), list: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireRole: mocks.authorize }));
vi.mock('@/lib/payment-mail/queries', () => ({ loadPaymentMailList: mocks.list, PaymentMailError: class extends Error {} }));
vi.mock('@/components/app-shell', () => ({AppShell: ({children}: {children: ReactNode}) => <>{children}</>}));
afterEach(() => vi.resetAllMocks());

it('starts the guarded list on the server and streams the tools before the actual pending messages', async () => {
  const authorization = Promise.withResolvers<{ role: string }>();
  const records = Promise.withResolvers<{ items: unknown[]; total: number }>();
  mocks.authorize.mockReturnValue(authorization.promise);
  mocks.list.mockReturnValue(records.promise);
  const rendering = Page({searchParams: Promise.resolve({})});
  expect(mocks.authorize).toHaveBeenCalledWith(['admin']);
  expect(mocks.list).not.toHaveBeenCalled();
  authorization.resolve({role:'admin'});
  const page = await rendering;
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith({status:'pending',limit:50,offset:0});
  let html = '';
  const output = new PassThrough();
  output.setEncoding('utf8').on('data', chunk => { html += chunk; });
  const end = new Promise<void>((resolve, reject) => {
    output.on('end',resolve).on('error',reject);
    const stream = renderToPipeableStream(<html><body>{page}</body></html>, {onShellReady: () => stream.pipe(output), onError:reject});
  });
  try {
    await vi.waitFor(() => expect(html).toContain('Search shown emails'));
    expect(html).toContain('Payment inbox');
    expect(html).toContain('Receipt List');
    expect(html).not.toContain('Actual server message');
  } finally {
    records.resolve({items:[{id:'record',subject:'Actual server message',sender_email:'test@example.test',status:'needs_review',received_at:'2026-10-30T00:00:00Z',review_reasons:[]}],total:1});
    await end;
  }
  expect(html).toContain('Actual server message');
  expect(html).toContain('Verify Actual server message');
});
