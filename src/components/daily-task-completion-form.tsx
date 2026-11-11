"use client";

import { EvidencePhotoPicker } from "@/components/evidence-photo-picker";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { completeDailyTask, prepareDailyTaskEvidence } from "@/app/(dashboard)/staff/daily-tasks/actions";
import { prepareAdminDailyTaskEvidence, completeAdminDailyTask } from "@/app/(dashboard)/admin/daily-tasks/evidence-actions";
import { createClient } from "@/lib/supabase/client";
import { mapPhotoBatches } from "@/lib/operational-photo-batch";

async function compressPhoto(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This photo format cannot be read. Please use JPG, PNG or WebP."));
      image.src = objectUrl;
    });
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable on this phone.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob) throw new Error("Unable to prepare this photo.");
    return new File([blob], "task-completion.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function DailyTaskCompletionForm({ taskId, admin = false, supplemental = false }: { taskId: number; admin?: boolean; supplemental?: boolean }) {
  const router = useRouter();
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!photos.length) { setError("Take or upload at least one completion photo."); return; }
    // Capture the value before awaiting uploads. React no longer keeps a usable
    // currentTarget after asynchronous work on every browser.
    const comment = String(new FormData(event.currentTarget).get("comment") || "");
    setBusy(true);
    setError("");
    setProgress("Preparing photo uploads…");
    try {
      const prepared = await (admin ? prepareAdminDailyTaskEvidence : prepareDailyTaskEvidence)(taskId, photos.length);
      if ("error" in prepared) { setError(prepared.error || "Unable to prepare the photo upload."); return; }
      if (prepared.uploads.length !== photos.length) throw new Error("Unable to prepare all photo uploads.");
      const storage = createClient().storage.from("checkout-evidence");
      let previousCompression: Promise<File | undefined> = Promise.resolve(undefined);
      let uploaded = 0;
      setProgress(`Uploaded 0 of ${photos.length} photos…`);
      const paths = await mapPhotoBatches(prepared.uploads, async ({ path, token }, index) => {
        // Decode one full-size photo at a time while earlier transfers run.
        const compression = previousCompression.then(() => compressPhoto(photos[index]));
        previousCompression = compression;
        const compressed = await compression;
        const { error: uploadError } = await storage.uploadToSignedUrl(path, token, compressed);
        if (uploadError) throw new Error(`Photo ${index + 1} could not upload: ${uploadError.message}`);
        uploaded += 1;
        setProgress(`Uploaded ${uploaded} of ${photos.length} photos…`);
        return path;
      });
      setProgress("Saving task evidence…");
      const completed = await (admin ? completeAdminDailyTask : completeDailyTask)(taskId, comment, paths);
      if ("error" in completed) { setError(completed.error || "Unable to complete this task."); return; }
      setPhotos([]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete this task.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return <form className="daily-task-complete-form" onSubmit={submit}>
    {error && <p className="error" role="alert">{error}</p>}
    <label className="field"><span>Completion notes</span><textarea disabled={busy} name="comment" rows={4} maxLength={1000} placeholder="Describe the work completed, or any handover note." /></label>
    <EvidencePhotoPicker photos={photos} onChange={setPhotos} disabled={busy}/>
    {progress && <p role="status">{progress}</p>}
    <button className="button" type="submit" disabled={busy}>{busy ? "Saving…" : supplemental ? "Save additional photos" : "Confirm Completion"}</button>
  </form>;
}
