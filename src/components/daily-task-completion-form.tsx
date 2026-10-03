"use client";

import { Camera, ImageUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { completeDailyTask, prepareDailyTaskEvidence } from "@/app/(dashboard)/staff/daily-tasks/actions";
import { createClient } from "@/lib/supabase/client";

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

export function DailyTaskCompletionForm({ taskId }: { taskId: number }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function choose(files: FileList | null, source: "camera" | "upload") {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const combined = source === "camera" ? selected : [...photos, ...selected];
    if (combined.length > 6) { setError("You can attach up to 6 photos."); return; }
    setPhotos(combined);
    setError("");
    if (source === "camera" && uploadRef.current) uploadRef.current.value = "";
    if (source === "upload" && cameraRef.current) cameraRef.current.value = "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photos.length) { setError("Take or upload at least one completion photo."); return; }
    setBusy(true);
    setError("");
    try {
      const prepared = await prepareDailyTaskEvidence(taskId, photos.length);
      if ("error" in prepared) { setError(prepared.error || "Unable to prepare the photo upload."); return; }
      const db = createClient();
      for (let index = 0; index < photos.length; index += 1) {
        const compressed = await compressPhoto(photos[index]);
        const upload = prepared.uploads[index];
        const { error: uploadError } = await db.storage.from("checkout-evidence").uploadToSignedUrl(upload.path, upload.token, compressed);
        if (uploadError) throw new Error(`Photo ${index + 1} could not upload: ${uploadError.message}`);
      }
      const comment = String(new FormData(event.currentTarget).get("comment") || "");
      const completed = await completeDailyTask(taskId, comment, prepared.uploads.map((upload) => upload.path));
      if ("error" in completed) { setError(completed.error || "Unable to complete this task."); return; }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete this task.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="daily-task-complete-form" onSubmit={submit}>
    {error && <p className="error">{error}</p>}
    <label className="field"><span>Completion notes</span><textarea name="comment" rows={4} maxLength={1000} placeholder="Describe the work completed, or any handover note." /></label>
    <section className="cleaner-photo-section">
      <div><span>Completion photos *</span><small>Attach 1 to 6 photos. Camera photos are compressed before upload.</small></div>
      <div className="cleaner-photo-actions">
        <label className="cleaner-photo-button"><Camera size={22}/><span>Take Photo</span><input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => choose(event.target.files, "camera")} /></label>
        <label className="cleaner-photo-button"><ImageUp size={22}/><span>Upload Photos</span><input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => choose(event.target.files, "upload")} /></label>
      </div>
      {photos.length > 0 && <p className="cleaner-photo-selected">✓ {photos.length} photo{photos.length === 1 ? "" : "s"} ready</p>}
    </section>
    <button className="button" type="submit" disabled={busy}>{busy ? "Completing…" : "Complete task"}</button>
  </form>;
}
