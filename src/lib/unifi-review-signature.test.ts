// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ saved: vi.fn(), rpc: vi.fn(), owner: vi.fn() }));
vi.mock('./supabase/server', () => ({ createClient: async () => ({ from: () => ({ select: () => ({
  eq: (column: string, id: string) => { mocks.owner(column, id); return { maybeSingle: mocks.saved }; },
}) }) }) }));
vi.mock('./supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
import { advanceUnifiInvoiceReview } from './unifi-invoices';
const actor = '7a40e00f-2e95-4c27-83d9-0f7dba788b77';
const signature = { strokes: [[[.1, .2], [.8, .7]]] };
beforeEach(() => { vi.resetAllMocks(); });
it('loads the saved personal signature through the owner session before committing verification', async () => {
  mocks.saved.mockResolvedValue({ data: { signature }, error: null });
  mocks.rpc.mockResolvedValue({ data: 'james', error: null });
  expect(await advanceUnifiInvoiceReview('invoice', 'kevin', actor)).toBe('james');
  expect(mocks.owner).toHaveBeenCalledWith('user_id', actor);
  expect(mocks.rpc).toHaveBeenCalledWith('advance_signed_unifi_invoice_review', {
    p_invoice_id: 'invoice', p_expected_stage: 'kevin', p_actor_id: actor, p_signature: signature,
  });
});
it('does not advance a review with a missing or invalid saved signature', async () => {
  for (const data of [null, { signature: { strokes: [] } }]) {
    mocks.saved.mockResolvedValue({ data, error: null });
    await expect(advanceUnifiInvoiceReview('invoice', 'kevin', actor)).rejects.toThrow('E-signature');
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
