'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { prepareComplianceUpload, uploadComplianceDocument } from '@/app/(dashboard)/admin/cert-servicing/actions';
import { complianceDocumentBucket, complianceDocumentKinds, complianceDocumentLabels, compliancePdfLimit } from '@/lib/compliance-workflow';
import { createClient } from '@/lib/supabase/client';

export function CompliancePdfUpload({ recordId, cycleId }: { recordId: string; cycleId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const pdf = values.get('file');
    if (!(pdf instanceof File) || !pdf.size || pdf.size > compliancePdfLimit || !pdf.name.toLowerCase().endsWith('.pdf')) {
      setMessage({ error: 'Choose a PDF up to 25 MB.' });
      return;
    }
    setBusy(true);
    setMessage({});
    try {
      const digest = await crypto.subtle.digest('SHA-256', await pdf.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      const prepared = await prepareComplianceUpload({ recordId, cycleId, sha256, sizeBytes: pdf.size, fileName: pdf.name });
      if ('error' in prepared) throw new Error(prepared.error);
      if (prepared.token) {
        const { error } = await createClient().storage.from(complianceDocumentBucket)
          .uploadToSignedUrl(prepared.path, prepared.token, pdf, { contentType: 'application/pdf' });
        if (error) {
          // Another upload may have completed while this one was in flight.
          const retry = await prepareComplianceUpload({ recordId, cycleId, sha256, sizeBytes: pdf.size, fileName: pdf.name });
          if ('error' in retry || retry.token) throw new Error('Upload did not finish. Try again.');
        }
      }
      values.delete('file');
      values.set('recordId', recordId);
      values.set('cycleId', cycleId);
      values.set('sha256', sha256);
      values.set('sizeBytes', String(pdf.size));
      values.set('fileName', pdf.name);
      const saved = await uploadComplianceDocument(values);
      if ('error' in saved) throw new Error(saved.error);
      form.reset();
      setMessage({ success: 'PDF attached to this cycle.' });
      router.refresh();
    } catch (error) {
      setMessage({ error: error instanceof Error ? error.message : 'Unable to upload the PDF.' });
    } finally {
      setBusy(false);
    }
  }

  return <form className="form-stack" onSubmit={submit}>
    <label>Document type
      <select name="kind" required defaultValue="">
        <option value="" disabled>Select document type</option>
        {complianceDocumentKinds.map(kind => <option key={kind} value={kind}>{complianceDocumentLabels[kind]}</option>)}
      </select>
    </label>
    <label>PDF <input type="file" name="file" accept=".pdf,application/pdf" required /></label>
    {message.error && <p className="error" role="alert">{message.error}</p>}
    {message.success && <p className="success" role="status">{message.success}</p>}
    <button type="submit" className="button secondary-button" disabled={busy}>{busy ? 'Uploading…' : 'Upload PDF'}</button>
  </form>;
}
