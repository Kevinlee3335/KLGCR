// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const { getProfile, download, upload, getRecords } = vi.hoisted(() => ({
  getProfile: vi.fn(), download: vi.fn(), upload: vi.fn(), getRecords: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSessionProfile: getProfile }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ storage: { from: () => ({ download, upload }) } }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: getRecords }) }) }),
}));

const url = 'https://klgcr.example/api/cert-servicing/print?kind=servicing';

beforeEach(() => {
  vi.resetAllMocks();
  download.mockResolvedValue({ error: new Error('Object missing') });
  getRecords.mockResolvedValue({ data: [], error: null });
});

describe('private compliance print route', () => {
  it('checks access before reading the private workbook and permits only admins to replace it', async () => {
    getProfile.mockResolvedValue({ role: 'staff' });
    expect((await GET(new Request(url))).status).toBe(403);
    getProfile.mockResolvedValue({ role: 'management_viewer' });
    expect((await POST(new Request(url, { method: 'POST' }))).status).toBe(403);
    expect(download).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('points admins to the upload page when the original workbook is missing', async () => {
    getProfile.mockResolvedValue({ role: 'admin' });
    const response = await GET(new Request(url));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/admin/cert-servicing/print-template');
  });

  it('leaves the existing template in place if the replacement is not an Excel workbook', async () => {
    getProfile.mockResolvedValue({ role: 'admin' });
    const body = new FormData();
    body.set('template', new File(['invalid workbook'], 'template.xlsx'));
    const response = await POST(new Request(url, { method: 'POST', body }));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get('location')!).searchParams.get('error')).toContain('Excel .xlsx');
    expect(upload).not.toHaveBeenCalled();
  });
});
