// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ profile: vi.fn(), load: vi.fn(), pdf: vi.fn(), filename: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSessionProfile: mocks.profile }));
vi.mock('@/lib/deposit-documents', () => ({ loadDepositDocument: mocks.load, ensureDepositDocumentPdf: mocks.pdf, depositDocumentFilename: mocks.filename }));
import { GET } from './route';

const id = '73003333-3333-4333-8333-333333333333';
function get(kind = 'receipt', documentId = id, download = false) {
  return GET(new NextRequest(`https://app.example.test/api/gym-deposits/${kind}/${documentId}/pdf${download ? '?download=1' : ''}`), { params: Promise.resolve({ kind, id: documentId }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.profile.mockResolvedValue({ role: 'admin' });
  mocks.load.mockResolvedValue({ id, source_module: 'gym' });
  mocks.pdf.mockResolvedValue(Buffer.from('%PDF-archived-cash-record'));
  mocks.filename.mockReturnValue('KLGDR-2600001.pdf');
});

it.each([null, { role: 'gym_patrol' }, { role: 'maintenance_staff' }])('rejects unauthorized PDF access before loading data (%o)', async profile => {
  mocks.profile.mockResolvedValue(profile);
  expect((await get()).status).toBe(403);
  expect(mocks.load).not.toHaveBeenCalled();
});

it('allows management to read the archived PDF with private cache headers', async () => {
  mocks.profile.mockResolvedValue({ role: 'management_viewer' });
  const response = await get();
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('%PDF-archived-cash-record');
  expect(response.headers.get('content-type')).toBe('application/pdf');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('content-disposition')).toBe('inline; filename="KLGDR-2600001.pdf"');
});

it('supports explicit download without another cash or email operation', async () => {
  const response = await get('voucher', id, true);
  expect(response.headers.get('content-disposition')).toBe('attachment; filename="KLGDR-2600001.pdf"');
  expect(mocks.load).toHaveBeenCalledWith('voucher', id);
  expect(mocks.pdf).toHaveBeenCalledWith('voucher', { id, source_module: 'gym' });
});

it('rejects raw paths, unknown document kinds and other modules', async () => {
  expect((await get('anything')).status).toBe(404);
  expect((await get('receipt', 'folder/private.pdf')).status).toBe(404);
  expect(mocks.load).not.toHaveBeenCalled();
  mocks.load.mockResolvedValue({ id, source_module: 'rental' });
  expect((await get()).status).toBe(404);
  expect(mocks.pdf).not.toHaveBeenCalled();
});

it('reports PDF preparation failure without pretending the cash record failed', async () => {
  mocks.pdf.mockRejectedValue(new Error('The PDF is archived, but its status needs a retry.'));
  const response = await get();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'The PDF is archived, but its status needs a retry.' });
});
