"use client";

import { startTransition, useState, type FormEvent, type ReactNode } from "react";
import { EvidencePhotoPicker } from "@/components/evidence-photo-picker";
import { prepareAdminInspectionEvidence } from "@/app/(dashboard)/admin/checkouts/actions";
import { prepareCheckoutEvidence } from "@/app/(dashboard)/staff/checkouts/actions";
import { createClient } from "@/lib/supabase/client";
import { validateEvidenceFiles } from "@/lib/photo-limits";
import { CHECKOUT_PHOTO_UPLOAD_CONCURRENCY, mapCheckoutPhotos } from "@/lib/checkout-photo-uploads";
import { prepareOperationalEvidencePhotos } from "@/lib/operational-evidence-compression";

export function CheckoutCompletionForm({ roomId, kind, action, children, buttonLabel }: { roomId: string; kind: "inspection" | "completion" | "cleaning"; action: (data: FormData) => Promise<void>; children: ReactNode; buttonLabel: string }) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    // An upload error must keep the form values available for a retry.
    event.preventDefault();
    if (busy) return;
    const invalid = kind === "inspection" && !photos.length ? null : validateEvidenceFiles(photos);
    if (invalid) {
      setError(invalid);
      return;
    }
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setProgress(photos.length ? "Preparing photos…" : "Saving inspection…");
    try {
      data.delete("photoPaths");
      const files = await prepareOperationalEvidencePhotos(photos);
      if (files.length) setProgress("Preparing photo uploads…");
      const descriptors = files.map(file => ({ type: file.type, size: file.size }));
      const prepared = kind === "inspection"
        ? await prepareAdminInspectionEvidence(roomId, descriptors)
        : await prepareCheckoutEvidence(roomId, kind, descriptors);
      if ("error" in prepared) throw new Error(prepared.error);
      const storage = createClient().storage.from("checkout-evidence");
      let uploaded = 0;
      if (files.length) setProgress(`Uploaded ${uploaded} of ${files.length} photos…`);
      const paths = await mapCheckoutPhotos(files, CHECKOUT_PHOTO_UPLOAD_CONCURRENCY, async (photo, index) => {
        const { path, token } = prepared.uploads[index];
        const { error: uploadError } = await storage.uploadToSignedUrl(path, token, photo);
        if (uploadError) throw new Error(`Photo ${index + 1} could not upload: ${uploadError.message}`);
        uploaded += 1;
        setProgress(`Uploaded ${uploaded} of ${files.length} photos…`);
        return path;
      });
      for (const path of paths) data.append("photoPaths", path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload photos. Please try again.");
      setBusy(false);
      setProgress("");
      return;
    }
    setProgress(photos.length ? "Saving all photos…" : "Saving inspection…");
    // Run the server action in a transition so Next handles the result and redirects.
    startTransition(async () => {
      try {
        await action(data);
      } finally {
        setBusy(false);
        setProgress("");
      }
    });
  }
  return (
    <form method="post" onSubmit={submit}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {children}
        <EvidencePhotoPicker
          label={kind === "inspection" ? "Inspection photos (optional)" : "Completion photos *"}
          photos={photos}
          onChange={setPhotos}
          disabled={busy}
        />
        {error && <p className="error" role="alert">{error}</p>}
        {progress && <p role="status">{progress}</p>}
        <button type="submit" className="button" disabled={busy}>{busy ? "Saving…" : buttonLabel}</button>
      </fieldset>
    </form>
  );
}
