import { beforeEach, expect, it, vi } from 'vitest';
import { loadMembershipMaster, loadMembershipMasterReport } from './membership-master-data';
import { buildMembershipMaster } from './membership-master';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./supabase/admin', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return { createAdminClient: () => createClient('https://db.example.test', 'fake', {
    auth: { persistSession: false }, global: { fetch: request },
  }) };
});
vi.mock('./membership-master', () => ({
  decodeMasterLayout: vi.fn(() => ({ sheets: [] })),
  buildMembershipMaster: vi.fn((_layout, members, payments) => ({ members, payments })),
}));
beforeEach(() => { vi.clearAllMocks(); });

it.each([false, true])('loads the full source workbook only for downloads, excludes deleted payments and starts independent tables together (export %s)', async exporting => {
  const gate = Promise.withResolvers<void>();
  const urls: URL[] = [];
  request.mockImplementation(async (input: string) => {
    const url = new URL(input);
    urls.push(url);
    if (url.pathname.endsWith('/membership_master_templates')) {
      await gate.promise;
      return Response.json({ layout: { gzip_base64: 'fixture' }, workbook_base64: 'YWJj' });
    }
    if (url.pathname.endsWith('/membership_payment_ledger')) return Response.json([{ payment_id: 'removed' }]);
    if (url.pathname.endsWith('/membership_payments')) return Response.json([{ id: 'kept' }, { id: 'removed' }]);
    return Response.json([{ id: 'member' }]);
  });
  const read = exporting ? loadMembershipMaster() : loadMembershipMasterReport();
  try {
    await vi.waitFor(() => expect(urls).toHaveLength(4));
    const columns = urls.find(url => url.pathname.endsWith('/membership_master_templates'))!.searchParams.get('select');
    expect(columns).toBe(exporting ? 'workbook_base64,layout' : 'layout');
  } finally { gate.resolve(); }
  const result = await read;
  expect(buildMembershipMaster).toHaveBeenCalledWith({ sheets: [] }, [{ id: 'member' }], [{ id: 'kept' }], expect.any(String));
  if (exporting) expect('bytes' in result && result.bytes.toString()).toBe('abc');
});
