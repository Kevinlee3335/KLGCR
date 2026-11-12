"use client";

import { EvidencePhotoPicker } from "@/components/evidence-photo-picker";
import { mapPhotoBatches } from "@/lib/operational-photo-batch";
import { prepareOperationalEvidencePhotos } from "@/lib/operational-evidence-compression";
import { validateEvidenceFiles } from "@/lib/photo-limits";
import { useState, type FormEvent } from "react";
import { completeJob, prepareCompletionUploads } from "@/app/(dashboard)/staff/jobs/actions";
import { createClient } from "@/lib/supabase/client";

export function CompleteJobForm({ jobId, returnTo }: { jobId: string; returnTo: string }) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const invalid = validateEvidenceFiles(photos);
    if (invalid) {
      setError(invalid);
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    setPending(true);
    setProgress("Preparing photos…");
    formData.delete("completionPhotoPaths");
    try {
      const files = await prepareOperationalEvidencePhotos(photos);
      setProgress("Preparing photo uploads…");
      const prepared = await prepareCompletionUploads(jobId, files.map(({ type, size }) => ({ type, size })));
      if (!prepared.uploads || prepared.uploads.length !== files.length) {
        throw new Error(prepared.error || "Unable to prepare the completion photo upload.");
      }
      const storage = createClient().storage.from("maintenance-evidence");
      let uploaded = 0;
      setProgress(`Uploaded 0 of ${files.length} photos…`);
      const paths = await mapPhotoBatches(prepared.uploads, async ({ path, token }, index) => {
        const { error: uploadError } = await storage.uploadToSignedUrl(path, token, files[index]);
        if (uploadError) throw new Error(`Photo ${index + 1} could not upload: ${uploadError.message}`);
        uploaded += 1;
        setProgress(`Uploaded ${uploaded} of ${files.length} photos…`);
        return path;
      });
      for (const path of paths) formData.append("completionPhotoPaths", path);

      // Photos were sent directly to Storage. Do not send the original camera
      // files through the Server Action, where large uploads can fail mid-submit.
      formData.delete("completionPhotos");
      setProgress("Saving completion…");
      const result = await completeJob(jobId, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      form.reset();
      // A full navigation avoids leaving the mobile app on an invalid Router
      // state after a large camera upload has just completed.
      window.location.assign(result?.returnTo || returnTo);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to complete this job. Please try again.");
    } finally {
      setPending(false);
      setProgress("");
    }
  }

  return <form method="post" onSubmit={submit}>
    <input type="hidden" name="returnTo" value={returnTo}/>
    <label className="field"><span>Action Taken / Work Done *</span><textarea disabled={pending} name="actionTaken" rows={5} required placeholder="Describe the repair or work completed"/></label>
    <EvidencePhotoPicker photos={photos} onChange={setPhotos} disabled={pending}/>
    {error && <p className="error" role="alert">{error}</p>}
    {progress && <p role="status">{progress}</p>}
    <button className="button" type="submit" disabled={pending} aria-disabled={pending}>{pending ? "Completing…" : "Confirm completion"}</button>
  </form>;
}
