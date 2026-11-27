import type { ReactNode } from 'react';
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PaymentList from './payment-list/page';
import CommitteeReports from './committee-reports/page';

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ id: 'admin', role: 'admin' }) }));
vi.mock('@/components/app-shell', () => ({ AppShell: ({children}: {children: ReactNode}) => <>{children}</> }));
vi.mock('@/components/membership-payment-list-refresh', () => ({ MembershipPaymentListRefresh: () => null }));
vi.mock('./committee-reports/actions', () => ({ saveCommitteeReport: vi.fn(), submitCommitteeForReview: vi.fn() }));
vi.mock('@/lib/supabase/admin', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient('https://db.example.test', 'fake', {auth: {persistSession: false}, global: { fetch: read }});
  return { createAdminClient: () => db };
});
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('KLGCR_MEMBERSHIP_ENABLED', 'true'); });
afterEach(() => vi.unstubAllEnvs());

async function checkStream(page: ReactNode, pending: ReturnType<typeof Promise.withResolvers<void>>, check: (html: () => string) => Promise<void>) {
  let html = '';
  const output = new PassThrough();
  output.setEncoding('utf8').on('data', chunk => { html += chunk; });
  const completed = new Promise<void>((resolve, reject) => {
    output.on('end', resolve).on('error', reject);
    const stream = renderToPipeableStream(<html><body>{page}</body></html>, {onShellReady: () => stream.pipe(output), onError: reject});
  });
  try { await check(() => html); } finally { pending.resolve(); await completed; }
}

it('opens the month controls and renders an empty ledger independently of import history', async () => {
  const gate = Promise.withResolvers<void>();
  read.mockImplementation(async (input: string) => {
    if (new URL(input).pathname.endsWith('/membership_payment_imports')) await gate.promise;
    return Response.json([]);
  });
  await checkStream(await PaymentList({searchParams: Promise.resolve({month:'2026-10'})}), gate, async html => {
    await vi.waitFor(() => expect(html()).toContain('No approved payments recorded for this month.'));
    expect(html()).toContain('2026-10/print');
    expect(html()).toContain('Monthly payment lists');
    expect(read.mock.calls.some(([url]) => new URL(url).pathname.endsWith('/deposit_receipts'))).toBe(false);
  });
});

it('opens saved reports and the eligible-month form while the current-month preview is pending', async () => {
  const gate = Promise.withResolvers<void>();
  read.mockImplementation(async (input: string) => {
    if (new URL(input).pathname.endsWith('/preview_membership_committee_report')) { await gate.promise; return Response.json(null); }
    return Response.json([], {headers: {'Content-Range':'*/0'}});
  });
  await checkStream(await CommitteeReports({searchParams: Promise.resolve({year:'2026'})}), gate, async html => {
    await vi.waitFor(() => expect(html()).toContain('No saved reports for this selection.'));
    expect(html()).toContain('Save a monthly report');
    expect(html()).toContain('value="2026"');
    expect(read.mock.calls.some(([url]) => new URL(url).pathname.endsWith('/gym_monthly_approvals'))).toBe(false);
  });
});
