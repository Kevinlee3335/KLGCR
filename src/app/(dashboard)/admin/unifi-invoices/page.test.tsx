// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { beforeEach, expect, it, vi } from 'vitest';
import { documentReviewerForStage } from '@/lib/document-review-status';
import { streamPage } from '@/test/stream-page';
import { listMatchedUnifiInvoiceIds } from '@/lib/unifi-receipts';
import Page from './page';

const mocks = vi.hoisted(() => ({ role: vi.fn(), invoices: vi.fn(), delivery: vi.fn(), db: vi.fn(), connection: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireRole: mocks.role }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.db }));
vi.mock('@/lib/unifi-invoice-mail', () => ({ listUnifiInvoiceDeliveries: mocks.delivery }));
vi.mock('@/lib/unifi-invoices', () => ({ listUnifiInvoices: mocks.invoices, unifiInvoicePath: '/admin/unifi-invoices',
  isUnifiPendingStage: (s: string) => s !== 'approved' && s !== 'archived' }));
vi.mock('@/lib/unifi-webmail-connection', () => ({ getUnifiWebmailConnectionStatus: mocks.connection }));
vi.mock('@/components/app-shell', () => ({ AppShell: ({children}: { children: React.ReactNode }) => <main>{children}</main> }));
beforeEach(() => { vi.resetAllMocks(); });

function database(fetch: typeof globalThis.fetch) {
  mocks.db.mockReturnValue(createClient('https://invoices.example','fixture-key',{
    auth: { persistSession: false, autoRefreshToken: false }, global: {fetch},
  }));
}
const invoice = { id: 'fixture-approved', period: '2026-11', review_stage: 'approved', line_number: 1, invoice_number: 'FIX-1' };
it("opens the upload form first, and review links before mail, receipts and connection status settle", async () => {
  mocks.role.mockResolvedValue({ id: documentReviewerForStage.kevin.id, username: 'kevinlee3335', is_super_admin: true });
  let invoices!: (rows: unknown[]) => void, delivery!: (value: Map<string, unknown>) => void;
  let connection!: (value: unknown) => void, receipts!: (rows: unknown[]) => void;
  mocks.invoices.mockReturnValue(new Promise(resolve => { invoices = resolve; }));
  mocks.delivery.mockReturnValue(new Promise(resolve => { delivery = resolve; }));
  mocks.connection.mockReturnValue(new Promise(resolve => { connection = resolve; }));
  let receiptQuery: URL | undefined;
  database(input => {
    receiptQuery = new URL(String(input));
    return new Promise(resolve => { receipts = rows => resolve(Response.json(rows)); });
  });
  const page = streamPage(await Page({ searchParams: Promise.resolve({}) }));
  try {
    await vi.waitFor(() => expect(page.html()).toContain('Upload invoice'));
    expect(page.html()).toContain('/api/unifi-invoices/import');
    expect(page.html()).toContain('Payment receipts in Documents');
    expect(page.html()).not.toContain('FIX-1');
    expect(receiptQuery?.searchParams.get('select')).toBe('invoice_id');
    expect(receiptQuery?.searchParams.get('invoice_id')).toBe('not.is.null');
    invoices([invoice, {...invoice, id:'for-review', review_stage:'verification', line_number:2}]);
    await vi.waitFor(() => expect(page.html()).toContain('Review November 2026 invoice · Line 2'));
    expect(page.html()).toContain('Open November 2026 invoice · Line 1');
    expect(page.html()).toContain('Approved by James');
    expect(page.html()).not.toContain('No matched receipt');
    expect(mocks.delivery).toHaveBeenCalledWith(['fixture-approved']);
    receipts([{invoice_id: 'fixture-approved'}]);
    delivery(new Map([['fixture-approved', {status:'sent'}]]));
    connection({ connected: true, checkedFolders: ['Inbox'] });
    await vi.waitFor(() => {
      expect(page.html()).toContain('Email sent to Joey');
      expect(page.html()).toContain('Sync now');
      expect(page.html()).toContain('Receipt received');
      expect(page.html()).toContain('No matched receipt');
    });
    expect(mocks.role).toHaveBeenCalledWith(['admin']);
    expect(page.errors).toEqual([]);
  } finally { page.close(); }
});

it('keeps invoice links usable when receipt status is unavailable and hides the private connection from other admins', async () => {
  mocks.role.mockResolvedValue({ id:'other', username:'other', is_super_admin:false });
  mocks.invoices.mockResolvedValue([{...invoice, review_stage:'archived'}]);
  database(async () => Response.json({message:'failed'}, {status:403}));
  const page = streamPage(await Page({searchParams:Promise.resolve({})}));
  try {
    await vi.waitFor(() => expect(page.html()).toContain('Receipt status unavailable'));
    expect(page.html()).toContain('/admin/unifi-invoices/fixture-approved');
    expect(page.html()).not.toContain('No matched receipt');
    expect(page.html()).not.toContain('/api/unifi-invoices/connection');
    expect(mocks.delivery).not.toHaveBeenCalled();
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(page.errors).toEqual([]);
  } finally { page.close(); }
});

it('deduplicates receipt matches and includes IDs beyond one response page', async () => {
  const offsets: string[] = [];
  database(async input => {
    const params = new URL(String(input)).searchParams;
    offsets.push(params.get('offset')!);
    return Response.json(params.get('offset') === '0' ? Array(1000).fill({invoice_id: 'first'}) : [{invoice_id: 'other'}]);
  });
  expect([...await listMatchedUnifiInvoiceIds()]).toEqual(['first','other']);
  expect(offsets).toEqual(['0','1000']);
});
