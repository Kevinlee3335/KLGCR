// @vitest-environment node

import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { createClient } from '@supabase/supabase-js';
import { it, expect, vi } from 'vitest';
import Page from './page';

const { database } = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('./actions', () => ({ createSecurityLink: vi.fn(), disableSecurityLink: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireRole: () => Promise.resolve({ role: 'management_viewer' }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: database }));
vi.mock('@/lib/supabase/server', () => ({ createClient: database }));
vi.mock('@/components/app-shell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

it('streams the month and status before private evidence and the Friday report, preserving cross-month records', async () => {
  const resolves = new Map<string, (rows: unknown) => void>();
  const queries = new Map<string, URL>();
  database.mockReturnValue(createClient('https://waste.example', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      const url = new URL(String(input)), resource = url.pathname.split('/').pop()!;
      queries.set(resource, url);
      return new Promise<Response>(resolve => resolves.set(resource, rows => resolve(Response.json(rows))));
    } },
  }));
  const output = new PassThrough();
  let html = '';
  output.setEncoding('utf8').on('data', chunk => { html += chunk; });
  const page = await Page({ searchParams: Promise.resolve({ month: '2026-11' }) });
  const stream = renderToPipeableStream(<html><body>{page}</body></html>, { onShellReady: () => stream.pipe(output) });
  try {
    await vi.waitFor(() => {
      expect(html).toContain('type="month"');
      expect(resolves.has('waste_collections')).toBe(true);
      expect(resolves.has('waste_collection_report_text')).toBe(true);
    });
    expect(queries.has('waste_security_links')).toBe(false);
    expect(queries.get('waste_schedule_dates')?.searchParams.get('select')).toContain('collection:waste_collections!schedule_id');
    const linked = { id: 'linked', collected_at: '2026-12-01T04:00:00Z', schedule_id: 'scheduled', bins: 3,
      created_at: '2026-12-01T04:01:00Z', guard_name: 'Linked fixture', remarks: 'Outside selected month', photos: ['linked.jpg'] };
    resolves.get('waste_schedule_dates')!([{ collection_date: '2026-11-30', review_status: 'open', collection: linked }]);
    resolves.get('waste_collections')!([{ ...linked, id: 'extra', collected_at: '2026-11-24T06:00:00Z',
      schedule_id: null, guard_name: 'Extra fixture', bins: 7, photos: ['extra.jpg'] }]);
    await vi.waitFor(() => expect(html).toContain('Collection status · '));
    expect(html).toContain('<strong>7</strong><span>Bins collected');
    expect(html).toContain('Delayed');
    expect(html).not.toContain('alt="Waste collection evidence"');
    await vi.waitFor(() => expect(resolves.has('waste-collection')).toBe(true));
    resolves.get('waste-collection')!(['extra.jpg', 'linked.jpg'].map(path => ({ path, signedURL: '/object/sign/' + path })));
    resolves.get('waste_schedule_uploads')!([]);
    resolves.get('waste_collection_report_text')!('weekly fixture');
    await vi.waitFor(() => expect(html).toContain('Outside selected month'));
    expect(html).toContain('Extra fixture');
    expect(html).toContain('/object/sign/linked.jpg');
    expect(html).toContain('/object/sign/extra.jpg');
  } finally {
    stream.abort();
    output.destroy();
  }
});
