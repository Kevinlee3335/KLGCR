'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchDocumentReviewPushes } from '@/lib/document-review-notifications';
import { dispatchComplianceApprovalEmail } from '@/lib/compliance-approval-delivery';
import {
  complianceDocumentBucket, complianceDocumentKinds, complianceListPaths, compliancePath, compliancePdfLimit,
  complianceRecordPath, complianceRecordTypes, complianceReviewers, complianceUploadPath,
} from '@/lib/compliance-workflow';

const uuid = z.string().uuid();
const date = z.string().date();
const documentKind = z.enum(complianceDocumentKinds);
const evidenceKind = z.enum(['invoice', 'service_report', 'certificate', 'agreement']);
const reviewStage = z.enum(['fikri', 'kevin', 'james']);
const optionalText = (limit: number) => z.string().trim().max(limit).transform(value => value || null);
const optionalDate = z.union([date, z.literal('')]).transform(value => value || null);

const recordFields = z.object({
  record_type: z.enum(complianceRecordTypes),
  title: z.string().trim().min(1).max(200),
  provider: optionalText(180),
  location: optionalText(160),
  reference_no: optionalText(120),
  next_due_date: optionalDate,
  effective_date: optionalDate,
  frequency: optionalText(80),
  contact_name: optionalText(120),
  contact_phone: optionalText(80),
  contact_email: z.union([z.string().trim().email().max(254), z.literal('')]).transform(value => value || null),
  supplier_key: z.union([z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(48), z.literal('')]).transform(value => value || null),
  notes: optionalText(5000),
  required_evidence: z.array(evidenceKind).max(4).transform(values => [...new Set(values)]).optional(),
  template_row: z.union([z.coerce.number().int().min(1).max(1_048_576), z.null()]).optional(),
});

const uploadFields = z.object({
  recordId: uuid,
  cycleId: uuid,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.coerce.number().int().positive().max(compliancePdfLimit),
  fileName: z.string().trim().min(1).max(255).regex(/^[^/\r\n\\]+\.pdf$/i),
});

type ActionResult = { error: string } | { ok: true };

function value(form: FormData, key: string) {
  const item = form.get(key);
  return typeof item === 'string' ? item : '';
}

function fields(form: FormData, keys: string[]) {
  return Object.fromEntries(keys.map(key => [key, value(form, key)]));
}

function feedback(path: string, message: string): never {
  redirect(path + '?error=' + encodeURIComponent(message));
}

function revalidateRecord(recordId: string) {
  revalidatePath(compliancePath, 'layout');
  revalidatePath(complianceRecordPath(recordId));
  revalidatePath('/admin');
}

function scheduleWork(task: () => Promise<void>) {
  try {
    after(() => task().catch(() => console.error('Compliance follow-up remains queued')));
  } catch {
    console.error('Compliance follow-up remains queued');
  }
}

async function isOpenCycle(recordId: string, cycleId: string) {
  const { data, error } = await createAdminClient().from('compliance_cycles').select('id')
    .eq('id', cycleId).eq('record_id', recordId).eq('status', 'open').maybeSingle();
  return !error && Boolean(data);
}

export async function saveComplianceRecord(form: FormData) {
  const actor = await requireRole(['admin']);
  const rawId = value(form, 'recordId');
  const recordId = uuid.safeParse(rawId).data;
  const type = z.enum(complianceRecordTypes).safeParse(value(form, 'recordType')).data;
  const back = recordId ? complianceRecordPath(recordId) : type ? complianceListPaths[type] : compliancePath;
  const input = recordFields.safeParse({
    record_type: type,
    title: value(form, 'title'),
    provider: value(form, 'provider'),
    location: value(form, 'location'),
    reference_no: value(form, 'referenceNo'),
    next_due_date: value(form, 'nextDueDate'),
    effective_date: value(form, 'effectiveDate'),
    frequency: value(form, 'frequency'),
    contact_name: value(form, 'contactName'),
    contact_phone: value(form, 'contactPhone'),
    contact_email: value(form, 'contactEmail'),
    supplier_key: value(form, 'supplierKey'),
    notes: value(form, 'notes'),
    required_evidence: value(form, 'requiredEvidenceProvided') === '1' ? form.getAll('requiredEvidence') : undefined,
    template_row: form.has('templateRow') ? value(form, 'templateRow') || null : undefined,
  });
  if (!input.success || (rawId && !recordId)) feedback(back, 'Enter valid record details and dates.');

  const { data, error } = await createAdminClient().rpc('save_compliance_record', {
    p_actor_id: actor.id,
    p_record_id: recordId ?? null,
    p_record: input.data,
  });
  if (error || !uuid.safeParse(data).success) feedback(back, 'Unable to save the record. Check the supplier and dates.');
  revalidateRecord(data);
  redirect(complianceRecordPath(data) + '?saved=1');
}

export async function prepareComplianceUpload(input: { recordId: string; cycleId: string; sha256: string; sizeBytes: number; fileName: string }) {
  await requireRole(['admin']);
  const parsed = uploadFields.safeParse(input);
  if (!parsed.success) return { error: 'Select a PDF up to 25 MB.' };
  const file = parsed.data;
  if (!await isOpenCycle(file.recordId, file.cycleId)) return { error: 'This cycle is no longer open.' };
  const storage = createAdminClient().storage.from(complianceDocumentBucket);
  const name = file.sha256 + '.pdf';
  const path = complianceUploadPath(file.cycleId, file.sha256);
  const existing = await storage.list(file.cycleId, { search: name, limit: 1 });
  if (existing.error) return { error: 'Unable to prepare the PDF upload.' };
  if (existing.data.some(object => object.name === name)) return { path, token: null };
  const { data, error } = await storage.createSignedUploadUrl(path, { upsert: false });
  if (error || !data) return { error: 'Unable to prepare the PDF upload.' };
  return { path, token: data.token };
}

export async function uploadComplianceDocument(form: FormData): Promise<ActionResult> {
  const actor = await requireRole(['admin']);
  const parsed = uploadFields.safeParse(fields(form, ['recordId', 'cycleId', 'sha256', 'sizeBytes', 'fileName']));
  const kind = documentKind.safeParse(value(form, 'kind')).data;
  if (!parsed.success || !kind) return { error: 'Select a document type and a valid PDF.' };
  const file = parsed.data;
  if (!await isOpenCycle(file.recordId, file.cycleId)) return { error: 'This cycle is no longer open.' };

  const db = createAdminClient();
  const path = complianceUploadPath(file.cycleId, file.sha256);
  const stored = await db.storage.from(complianceDocumentBucket).download(path);
  if (stored.error || !stored.data) return { error: 'The PDF upload did not finish. Try uploading again.' };
  const bytes = Buffer.from(await stored.data.arrayBuffer());
  if (bytes.length !== file.sizeBytes || !bytes.subarray(0, 1024).includes('%PDF-')
      || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
    return { error: 'The stored file could not be verified as the original PDF.' };
  }
  const saved = await db.rpc('attach_compliance_document', {
    p_actor_id: actor.id,
    p_cycle_id: file.cycleId,
    p_kind: kind,
    p_supplier_document_id: null,
    p_source_message_id: null,
    p_storage_path: path,
    p_file_name: file.fileName,
    p_sha256: file.sha256,
    p_size_bytes: file.sizeBytes,
  });
  if (saved.error || !saved.data) return { error: 'Unable to attach the PDF to this cycle.' };
  scheduleWork(() => dispatchDocumentReviewPushes(saved.data));
  revalidateRecord(file.recordId);
  return { ok: true };
}

export async function linkComplianceDocument(form: FormData) {
  const actor = await requireRole(['admin']);
  const recordId = uuid.safeParse(value(form, 'recordId')).data;
  if (!recordId) redirect(compliancePath);
  const back = complianceRecordPath(recordId);
  const cycleId = uuid.safeParse(value(form, 'cycleId')).data;
  const supplierId = uuid.safeParse(value(form, 'supplierDocumentId')).data;
  const kind = documentKind.safeParse(value(form, 'kind')).data;
  const sourceMessageId = value(form, 'sourceMessageId');
  if (!cycleId || !supplierId || !kind || (sourceMessageId && !/^[a-f0-9]{10,40}$/.test(sourceMessageId))
      || !await isOpenCycle(recordId, cycleId)) feedback(back, 'Select a PDF and a document type for this open cycle.');

  const { data, error } = await createAdminClient().rpc('attach_compliance_document', {
    p_actor_id: actor.id,
    p_cycle_id: cycleId,
    p_kind: kind,
    p_supplier_document_id: supplierId,
    p_source_message_id: sourceMessageId || null,
    p_storage_path: null,
    p_file_name: null,
    p_sha256: null,
    p_size_bytes: null,
  });
  if (error || !data) feedback(back, 'Unable to link this archive PDF. Check the supplier, source email and document type.');
  scheduleWork(() => dispatchDocumentReviewPushes(data));
  revalidateRecord(recordId);
  revalidatePath('/documents/suppliers', 'layout');
  redirect(back + '?linked=1');
}

async function documentBelongsToRecord(recordId: string, documentId: string) {
  const { data, error } = await createAdminClient().from('compliance_cycle_documents')
    .select('id,compliance_cycles!inner(record_id)').eq('id', documentId)
    .eq('compliance_cycles.record_id', recordId).maybeSingle();
  return !error && Boolean(data);
}

export async function reviewComplianceDocument(form: FormData) {
  const actor = await requireRole(['admin']);
  const recordId = uuid.safeParse(value(form, 'recordId')).data;
  if (!recordId) redirect(compliancePath);
  const back = complianceRecordPath(recordId);
  const documentId = uuid.safeParse(value(form, 'documentId')).data;
  const stage = reviewStage.safeParse(value(form, 'expectedStage')).data;
  if (!documentId || !stage || complianceReviewers[stage].id !== actor.id
      || !await documentBelongsToRecord(recordId, documentId)) feedback(back, 'This document is awaiting its assigned reviewer.');

  const { data, error } = await createAdminClient().rpc('advance_compliance_document_review', {
    p_actor_id: actor.id,
    p_document_id: documentId,
    p_expected_stage: stage,
  });
  if (error || !data) feedback(back, 'Unable to save this review. Refresh the record and check the current stage.');
  if (stage === 'james') scheduleWork(async () => { await dispatchComplianceApprovalEmail(documentId); });
  else scheduleWork(() => dispatchDocumentReviewPushes(documentId));
  revalidateRecord(recordId);
  redirect(back + '?reviewed=1');
}

export async function retryComplianceDelivery(form: FormData) {
  const actor = await requireRole(['admin']);
  const recordId = uuid.safeParse(value(form, 'recordId')).data;
  if (!recordId) redirect(compliancePath);
  const back = complianceRecordPath(recordId);
  const documentId = uuid.safeParse(value(form, 'documentId')).data;
  if (!documentId || actor.id !== complianceReviewers.james.id
      || !await documentBelongsToRecord(recordId, documentId)) feedback(back, 'Only James can check this approval email.');
  try {
    await dispatchComplianceApprovalEmail(documentId);
  } catch {
    feedback(back, 'Delivery could not be confirmed. Check the latest email status.');
  }
  revalidateRecord(recordId);
  redirect(back);
}

export async function saveComplianceCycleProgress(form: FormData) {
  const actor = await requireRole(['admin']);
  const recordId = uuid.safeParse(value(form, 'recordId')).data;
  if (!recordId) redirect(compliancePath);
  const back = complianceRecordPath(recordId);
  const cycleId = uuid.safeParse(value(form, 'cycleId')).data;
  const input = z.object({ performedOn: optionalDate, notes: optionalText(5000) }).safeParse(fields(form, ['performedOn', 'notes']));
  if (!cycleId || !input.success || !await isOpenCycle(recordId, cycleId)) feedback(back, 'Enter a valid actual return or work date.');
  const { error } = await createAdminClient().rpc('update_compliance_cycle_progress', {
    p_actor_id: actor.id,
    p_cycle_id: cycleId,
    p_performed_on: input.data.performedOn,
    p_notes: input.data.notes,
    p_requires_invoice: value(form, 'requiresInvoiceProvided') === '1' ? form.has('requiresInvoice') : null,
  });
  if (error) feedback(back, 'Unable to save the work date. Check the date and cycle status.');
  revalidateRecord(recordId);
  redirect(back + '?progress=1');
}

export async function completeComplianceCycle(form: FormData) {
  const actor = await requireRole(['admin']);
  const recordId = uuid.safeParse(value(form, 'recordId')).data;
  if (!recordId) redirect(compliancePath);
  const back = complianceRecordPath(recordId);
  const cycleId = uuid.safeParse(value(form, 'cycleId')).data;
  const dates = z.object({ performedOn: optionalDate, nextDueDate: optionalDate, nextEffectiveDate: optionalDate, notes: optionalText(5000) })
    .safeParse(fields(form, ['performedOn', 'nextDueDate', 'nextEffectiveDate', 'notes']));
  if (!cycleId || !dates.success || !await isOpenCycle(recordId, cycleId)) feedback(back, 'Enter the actual completion date and valid renewal dates.');
  const { error } = await createAdminClient().rpc('complete_compliance_cycle', {
    p_actor_id: actor.id,
    p_cycle_id: cycleId,
    p_performed_on: dates.data.performedOn,
    p_next_due_date: dates.data.nextDueDate,
    p_next_effective_date: dates.data.nextEffectiveDate,
    p_notes: dates.data.notes,
  });
  if (error) {
    const problem = error.message.startsWith('Required documents are missing') ? error.message : 'Unable to complete this cycle. Check its documents and renewal dates.';
    feedback(back, problem);
  }
  revalidateRecord(recordId);
  redirect(back + '?completed=1');
}
