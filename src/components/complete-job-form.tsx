"use client";

import { useRef, useState } from "react";
import { completeJob, prepareCompletionUpload } from "@/app/(dashboard)/staff/jobs/actions";
import { createClient } from "@/lib/supabase/client";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 10 * 1024 * 1024;

export function CompleteJobForm({ jobId, returnTo }: { jobId: string; returnTo: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    const files = formData.getAll("completionPhotos").filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length) {
      setError("Add at least one completion photo before confirming the job.");
      return;
    }

    setError("");
    setPending(true);
    try {
      const storage = createClient().storage.from("maintenance-evidence");
      for (const file of files) {
        if (!acceptedTypes.has(file.type) || file.size > maxBytes) {
          throw new Error("Completion photos must be JPG, PNG, or WEBP files up to 10 MB.");
        }
        const prepared = await prepareCompletionUpload(jobId, { name: file.name, type: file.type, size: file.size });
        if (prepared.error || !prepared.path || !prepared.token) {
          throw new Error(prepared.error || "Unable to prepare the completion photo upload.");
        }
        const { error: uploadError } = await storage.uploadToSignedUrl(prepared.path, prepared.token, file);
        if (uploadError) throw new Error(`Unable to upload completion photo: ${uploadError.message}`);
        formData.append("completionPhotoPaths", prepared.path);
      }

      // Photos were sent directly to Storage. Do not send the original camera
      // files through the Server Action, where large uploads can fail mid-submit.
      formData.delete("completionPhotos");
      const result = await completeJob(jobId, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      // A full navigation avoids leaving the mobile app on an invalid Router
      // state after a large camera upload has just completed.
      window.location.assign(result?.returnTo || returnTo);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to complete this job. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <form ref={formRef} action={submit}>
    <input type="hidden" name="returnTo" value={returnTo}/>
    <label className="field"><span>Action Taken / Work Done *</span><textarea name="actionTaken" rows={5} required placeholder="Describe the repair or work completed"/></label>
    <div className="field completion-photo-field"><span>Completion photo *</span><label className="completion-photo-camera" title="Take or choose completion photos"><input name="completionPhotos" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple required onChange={() => setError("")}/><span aria-hidden="true">📷</span><b>Take Photo</b></label><small className="subtle">At least one photo is required. You may add more than one.</small></div>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="button" type="submit" disabled={pending} aria-disabled={pending}>{pending ? "Completing…" : "Confirm completion"}</button>
  </form>;
}
