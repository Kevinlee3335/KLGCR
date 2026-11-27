// @vitest-environment node

import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { it, expect, vi } from 'vitest';
import { emptyFlexReview } from '@/lib/flex-inspection-review';
import Page from './page';

const mocks = vi.hoisted(() => ({ groups: vi.fn(), inspection: vi.fn(), review: vi.fn(), recipients: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireRole: () => Promise.resolve({ role: 'admin' }) }));
vi.mock('@/components/app-shell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/flex-inspection-catalog', () => ({ loadFlexGroups: mocks.groups }));
vi.mock('@/lib/flex-inspection-store', () => ({ loadFlexInspection: mocks.inspection }));
vi.mock('@/lib/flex-inspection-review-store', () => ({ isFlexPreview: () => false, flexReviewer: () => 'kevin', loadFlexReview: mocks.review }));
vi.mock('@/lib/flex-inspection-mail-settings', () => ({ flexInspectionMailRecipients: mocks.recipients }));
vi.mock('@/lib/flex-inspection-actions', () => ({}));
vi.mock('@/lib/flex-inspection-review-actions', () => ({}));

it('streams the month selector and then the saved checklist without waiting for verification or mail details', async () => {
  let releaseCatalog!: (groups: unknown[]) => void;
  let releaseReview!: (review: typeof emptyFlexReview) => void;
  let releaseMail!: (addresses: null) => void;
  mocks.groups.mockReturnValue(new Promise(resolve => { releaseCatalog = resolve; }));
  mocks.review.mockReturnValue(new Promise(resolve => { releaseReview = resolve; }));
  mocks.recipients.mockReturnValue(new Promise(resolve => { releaseMail = resolve; }));
  mocks.inspection.mockResolvedValue({ period: '2026-10', revision: 1, exceptions: {}, inspectionDate: '2026-10-01',
    inspectedByName: 'Fixture inspector', completedAt: '2026-10-01T08:00:00Z' });
  const output = new PassThrough();
  let html = '';
  output.setEncoding('utf8').on('data', chunk => { html += chunk; });
  const page = await Page({ searchParams: Promise.resolve({ period: '2026-10' }) });
  const stream = renderToPipeableStream(<html><body>{page}</body></html>, { onShellReady: () => stream.pipe(output) });
  try {
    await vi.waitFor(() => expect(html).toContain('Open month'));
    expect(html).not.toContain('Fixture inspector');
    releaseCatalog([{ id: 'fixture', report: 'fire-extinguisher', block: 'C', level: 1, location: 'Fixture Room', quantity: 1,
      sourceCell: 'A5', units: [{ id: 'fixture-1', label: 'Fixture unit' }] }]);
    await vi.waitFor(() => expect(html).toContain('Fixture Room'));
    expect(html).toContain('Fixture inspector');
    expect(html).toContain('Loading verification');
    releaseReview(emptyFlexReview);
    releaseMail(null);
    await vi.waitFor(() => expect(html).toContain('Waiting for verification'));
  } finally {
    stream.abort();
    output.destroy();
  }
});
