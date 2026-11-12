// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(), rpc: vi.fn(), from: vi.fn(), download: vi.fn(), after: vi.fn(), push: vi.fn(), mail: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(path); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/lib/auth', () => ({ requireRole: mocks.actor }));
vi.mock('@/lib/document-review-notifications', () => ({ dispatchDocumentReviewPushes: mocks.push }));
vi.mock('@/lib/compliance-approval-delivery', () => ({ dispatchComplianceApprovalEmail: mocks.mail }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from, storage: { from: () => ({ download: mocks.download }) } }),
}));

import { completeComplianceCycle, linkComplianceDocument, saveComplianceCycleProgress, uploadComplianceDocument } from './actions';

const recordId = '11111111-1111-4111-8111-111111111111';
const cycleId = '22222222-2222-4222-8222-222222222222';
const documentId = '33333333-3333-4333-8333-333333333333';
const actorId = '44444444-4444-4444-8444-444444444444';
const recordPath = '/admin/cert-servicing/records/' + recordId;

function form(extra: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries({ recordId, cycleId, ...extra })) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: { id: cycleId } });
  mocks.from.mockReturnValue(query);
  mocks.actor.mockResolvedValue({ id: actorId });
  mocks.rpc.mockResolvedValue({ data: documentId, error: null });
});

it('records the actual return without closing an open cycle', async () => {
  await expect(saveComplianceCycleProgress(form({ performedOn: '2025-11-15' }))).rejects.toThrow(recordPath + '?progress=1');
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('update_compliance_cycle_progress', {
    p_actor_id: actorId, p_cycle_id: cycleId, p_performed_on: '2025-11-15', p_notes: null, p_requires_invoice: null,
  });
  expect(mocks.after).not.toHaveBeenCalled();
});

it('links the exact archived PDF and email to the selected cycle', async () => {
  const sourceMessageId = '1234567890abcde1';
  await expect(linkComplianceDocument(form({ supplierDocumentId: documentId, sourceMessageId, kind: 'invoice' })))
    .rejects.toThrow(recordPath + '?linked=1');
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('attach_compliance_document', expect.objectContaining({
    p_cycle_id: cycleId, p_kind: 'invoice', p_supplier_document_id: documentId, p_source_message_id: sourceMessageId,
  }));
  expect(mocks.mail).not.toHaveBeenCalled();
});

it('attaches a valid private PDF and rejects a different upload before saving', async () => {
  const bytes = Buffer.from('%PDF-1.7 valid sample');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
  const details = { kind: 'agreement', fileName: 'signed.pdf', sizeBytes: String(bytes.length) };
  expect(await uploadComplianceDocument(form({ ...details, sha256: 'b'.repeat(64) }))).toHaveProperty('error');
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(await uploadComplianceDocument(form({ ...details, sha256 }))).toEqual({ ok: true });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('attach_compliance_document', expect.objectContaining({
    p_actor_id: actorId, p_cycle_id: cycleId, p_kind: 'agreement', p_storage_path: cycleId + '/' + sha256 + '.pdf',
  }));
});

it('reports which evidence blocks completion and uses the already recorded work date', async () => {
  const message = 'Required documents are missing or awaiting review: invoice';
  mocks.rpc.mockResolvedValue({ error: { message } });
  await expect(completeComplianceCycle(form({ nextDueDate: '2026-11-15' })))
    .rejects.toThrow(recordPath + '?error=' + encodeURIComponent(message));
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('complete_compliance_cycle', expect.objectContaining({
    p_cycle_id: cycleId, p_performed_on: null, p_next_due_date: '2026-11-15',
  }));
});
