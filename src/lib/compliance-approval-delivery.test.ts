// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { BILLING_MAIL_FROM, BILLING_MAIL_TO } from './billing-mail-settings';
import { documentReviewers } from './document-review-status';

const mocks = vi.hoisted(() => ({ db: vi.fn(), gateway: vi.fn() }));
vi.mock('./supabase/admin', () => ({ createAdminClient: mocks.db }));
vi.mock('./billing-mail', () => ({ gmailGateway: mocks.gateway }));
import { dispatchComplianceApprovalEmail } from './compliance-approval-delivery';

const documentId = '11111111-1111-4111-8111-111111111111';
const otherDocumentId = '22222222-2222-4222-8222-222222222222';
const recipient = 'accounts@supplier.example.com';
const pdf = Buffer.from('%PDF-1.7 unmodified supplier document');
const hash = createHash('sha256').update(pdf).digest('hex');
const senderRule = { supplier_id: 'supplier', rule: recipient };
const record = { supplier_key: 'supplier', contact_email: recipient };
const archived = { company: 'supplier', storage_path: 'supplier/original.pdf', content_hash: hash };
const message = { company: 'supplier', sender: 'Supplier <' + recipient + '>' };
const approval = {
  id: documentId, cycle_id: 'cycle', kind: 'invoice', source: 'supplier_email',
  source_message_id: 'supplier-message', supplier_document_id: 'supplier-document',
  storage_path: archived.storage_path, size_bytes: pdf.length, sha256: hash, file_name: 'Original.pdf',
};
const event = { document_id: documentId, recipient: null, status: 'pending', attempted_at: null };
const capabilities = {
  ok: true, sender: BILLING_MAIL_FROM, invoiceCc: BILLING_MAIL_TO,
  capabilities: ['compliancePdf', 'invoiceCc', 'idempotency'],
};

type Query = { table: string; filters: unknown[][]; write?: unknown };
type DatabaseOptions = {
  approval?: Record<string, unknown> | null;
  event?: Record<string, unknown>;
  record?: Record<string, unknown>;
  message?: Record<string, unknown>;
  attachment?: Buffer;
  skipClaim?: boolean;
};
function database(options: DatabaseOptions = {}) {
  const queries: Query[] = [];
  const data = (call: Query) => {
    switch (call.table) {
      case 'compliance_cycle_documents': return options.approval === undefined ? approval : options.approval;
      case 'compliance_document_delivery':
        return call.write ? (options.skipClaim ? null : { document_id: documentId }) : (options.event ?? event);
      case 'compliance_cycles': return { record_id: 'record' };
      case 'compliance_records': return options.record ?? record;
      case 'supplier_mail_documents': return archived;
      case 'supplier_emails': return options.message ?? message;
      case 'supplier_mail_sender_rules': return [senderRule];
      default: throw Error('Unexpected query ' + call.table);
    }
  };
  const download = vi.fn(async () => ({ data: new Blob([Uint8Array.from(options.attachment ?? pdf)]), error: null }));
  const storage = vi.fn(() => ({ download }));
  mocks.db.mockReturnValue({
    storage: { from: storage },
    from(table: string) {
      const call: Query = { table, filters: [] };
      queries.push(call);
      const result = async () => ({ data: data(call), error: null });
      const q: Record<string, unknown> = {
        select: () => q,
        update: (value: unknown) => { call.write = value; return q; },
        single: result,
        maybeSingle: result,
        then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => result().then(resolve, reject),
      };
      for (const name of ['eq', 'in', 'is']) q[name] = (...args: unknown[]) => { call.filters.push([name, ...args]); return q; };
      return q;
    },
  });
  return { queries, download, storage };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.gateway.mockImplementation(async request => request.action === 'compliance-capabilities' ? capabilities : {
    ok: true, status: 'sent', sender: request.from, key: request.key, kind: request.kind, to: request.to,
    cc: request.cc, sha256: request.sha256, sentAt: '2026-11-12T08:00:00Z',
  });
});

it('requires the James approval row before delivery and makes no gateway call for review-only documents', async () => {
  const { queries } = database({ approval: null });
  expect(await dispatchComplianceApprovalEmail(documentId)).toMatchObject({ status: 'blocked' });
  expect(queries[0].filters).toEqual(expect.arrayContaining([
    ['eq', 'review_stage', 'approved'], ['eq', 'james_approved_by', documentReviewers[2].id], ['in', 'kind', ['quotation', 'invoice']],
  ]));
  expect(mocks.gateway).not.toHaveBeenCalled();
});

it('emails the verified original supplier invoice PDF and copies Joey', async () => {
  const { queries, download, storage } = database();
  expect(await dispatchComplianceApprovalEmail(documentId)).toEqual({ status: 'sent' });
  expect(storage).toHaveBeenCalledWith('supplier-mail');
  expect(download).toHaveBeenCalledWith(archived.storage_path);
  expect(mocks.gateway.mock.calls[1][0]).toMatchObject({
    action: 'compliance-send', kind: 'invoice', from: BILLING_MAIL_FROM, to: recipient,
    cc: [BILLING_MAIL_TO], sha256: hash, pdfBase64: pdf.toString('base64'),
  });
  expect(queries.at(-1)?.write).toMatchObject({ status: 'sent', recipient, sent_at: '2026-11-12T08:00:00Z' });
});

it('sends an uploaded quotation only to the explicitly configured verified contact', async () => {
  const manual = { ...approval, source: 'upload', kind: 'quotation', supplier_document_id: null, source_message_id: null };
  const { storage } = database({ approval: manual });
  expect(await dispatchComplianceApprovalEmail(documentId)).toEqual({ status: 'sent' });
  expect(storage).toHaveBeenCalledWith('compliance-documents');
  expect(mocks.gateway.mock.calls[1][0]).toMatchObject({ kind: 'quotation', to: recipient, cc: [] });

  mocks.gateway.mockClear();
  database({ approval: manual, record: { ...record, contact_email: 'unknown@supplier.example.com' } });
  expect(await dispatchComplianceApprovalEmail(documentId)).toMatchObject({ status: 'blocked' });
  expect(mocks.gateway).not.toHaveBeenCalled();
});

it('blocks different companies, a changed pinned destination, and an invalid original PDF', async () => {
  database({ message: { ...message, company: 'another-supplier' } });
  expect(await dispatchComplianceApprovalEmail(documentId)).toMatchObject({ status: 'blocked' });
  database({ event: { ...event, recipient: 'different@example.com' } });
  expect(await dispatchComplianceApprovalEmail(documentId)).toMatchObject({ status: 'blocked' });
  expect(mocks.gateway).not.toHaveBeenCalled();
  database({ attachment: Buffer.from('%PDF-1.7 different content') });
  expect(await dispatchComplianceApprovalEmail(documentId)).toMatchObject({ status: 'failed' });
  expect(mocks.gateway).toHaveBeenCalledOnce();
});

it('does not send without confirmed invoice CC support or when the delivery is already claimed', async () => {
  database();
  mocks.gateway.mockResolvedValueOnce({ ...capabilities, invoiceCc: 'someone-else@example.com' });
  expect(await dispatchComplianceApprovalEmail(documentId)).toMatchObject({ status: 'blocked' });
  expect(mocks.gateway).toHaveBeenCalledOnce();
  mocks.gateway.mockClear();
  database({ skipClaim: true });
  expect(await dispatchComplianceApprovalEmail(documentId)).toMatchObject({ status: 'sending' });
  expect(mocks.gateway).not.toHaveBeenCalled();
});

it('keeps a busy gateway in the queue and blocks oversized PDF downloads', async () => {
  const { download } = database({ approval: { ...approval, size_bytes: 12_000_001 } });
  expect(await dispatchComplianceApprovalEmail(documentId)).toMatchObject({ status: 'blocked' });
  expect(download).not.toHaveBeenCalled();
  expect(mocks.gateway).not.toHaveBeenCalled();
  const { queries } = database();
  mocks.gateway.mockResolvedValueOnce(capabilities).mockResolvedValueOnce({ status: 'busy' });
  expect(await dispatchComplianceApprovalEmail(documentId)).toMatchObject({ status: 'pending' });
  expect(queries.at(-1)?.write).toMatchObject({ status: 'pending', sent_at: null });
});

it('retains the same gateway key across an interrupted request and a second cycle using the same PDF', async () => {
  const { queries } = database();
  mocks.gateway.mockResolvedValueOnce(capabilities).mockRejectedValueOnce(Error('connection interrupted'));
  expect(await dispatchComplianceApprovalEmail(documentId)).toMatchObject({ status: 'uncertain' });
  expect(queries.at(-1)?.write).toMatchObject({ status: 'uncertain', sent_at: null, recipient });
  const firstKey = mocks.gateway.mock.calls[1][0].key;
  database({ approval: { ...approval, id: otherDocumentId, cycle_id: 'second-cycle' } });
  expect(await dispatchComplianceApprovalEmail(otherDocumentId)).toMatchObject({ status: 'sent' });
  expect(mocks.gateway.mock.calls[3][0].key).toBe(firstKey);
});
