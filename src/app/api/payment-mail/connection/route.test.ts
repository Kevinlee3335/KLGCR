// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { inPaymentMailRange } from '@/lib/payment-mail/rules';

const db = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db }));
vi.mock('@/lib/payment-mail/queries', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/payment-mail/queries')>(),
  requirePaymentMailAdmin: vi.fn().mockResolvedValue({ id: 'admin' }),
}));

import { POST } from './route';

const origin = 'https://example.test';
function createKey(input: Record<string, unknown>) {
  return POST(new NextRequest(`${origin}/api/payment-mail/connection`, {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', ...input }),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  db.from.mockReturnValue({ insert: db.insert });
  db.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'connection' } }) }) });
});

it('saves midnight on 1 November in Malaysia as the earliest permitted mail', async () => {
  const response = await createKey({ startFrom: '2026-11-01' });
  expect(response.status).toBe(200);
  const { enabledFrom } = await response.json();
  expect(enabledFrom).toBe('2026-10-31T16:00:00.000Z');
  expect(db.from).toHaveBeenCalledWith('payment_mail_connections');
  expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ enabled_from: enabledFrom }));
  const now = Date.parse('2026-11-10T00:00:00Z');
  expect(inPaymentMailRange('2026-11-01T00:00:00+08:00', enabledFrom, now)).toBe(true);
  expect(inPaymentMailRange('2026-10-31T23:59:59+08:00', enabledFrom, now)).toBe(false);
});

it('rejects other absolute dates and conflicting import choices', async () => {
  expect((await createKey({ startFrom: '2026-10-01' })).status).toBe(400);
  expect((await createKey({ startFrom: '2026-11-01', lookbackDays: 0 })).status).toBe(400);
  expect(db.from).not.toHaveBeenCalled();
});
