"use client";

import { Camera, ImageUp, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { cancelCleanerComplaint, finalizeCleanerComplaint, prepareCleanerComplaint } from "@/app/(dashboard)/staff/complaints/new/actions";
import { createClient } from "@/lib/supabase/client";

type Block = { id: number; code: string };

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
    return new File([blob], "complaint-photo.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function CleanerComplaintForm({ blocks, reporterName }: { blocks: Block[]; reporterName: string }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoSource, setPhotoSource] = useState<"camera" | "upload" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function choosePhoto(file: File | undefined, source: "camera" | "upload") {
    if (!file) return;
    setPhoto(file);
    setPhotoSource(source);
    setError("");
    if (source === "camera" && uploadRef.current) uploadRef.current.value = "";
    if (source === "upload" && cameraRef.current) cameraRef.current.value = "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo) {
      setError("Take a photo or upload one before sending.");
      return;
    }
    setBusy(true);
    setError("");
    let prepared: Awaited<ReturnType<typeof prepareCleanerComplaint>> | null = null;
    try {
      const formData = new FormData(event.currentTarget);
      prepared = await prepareCleanerComplaint(formData);
      if ("error" in prepared) {
        setError(prepared.error ?? "Unable to prepare the complaint.");
        return;
      }
      const compressed = await compressPhoto(photo);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("checkout-evidence").uploadToSignedUrl(prepared.path, prepared.token, compressed);
      if (uploadError) {
        await cancelCleanerComplaint(prepared.complaintId, prepared.path);
        setError(`Photo upload failed: ${uploadError.message}`);
        return;
      }
      const finalized = await finalizeCleanerComplaint(prepared.complaintId, prepared.path);
      if ("error" in finalized) {
        setError(finalized.error ?? "Unable to finish sending the complaint.");
        return;
      }
      router.replace(`/staff/complaints/new?created=${encodeURIComponent(finalized.complaintNo)}`);
      router.refresh();
    } catch (cause) {
      if (prepared && !("error" in prepared)) await cancelCleanerComplaint(prepared.complaintId, prepared.path);
      setError(cause instanceof Error ? cause.message : "Unable to send the complaint.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="cleaner-complaint-form" onSubmit={submit}>
    <section className="cleaner-report-intro">
      <div><span>Reported by</span><strong>{reporterName}</strong></div>
      <p>The complaint will be sent directly to Admin for checking and assignment.</p>
    </section>
    {error && <p className="error cleaner-report-error">{error}</p>}
    <div className="cleaner-report-grid">
      <label className="field"><span>Block *</span><select name="blockId" required defaultValue=""><option value="" disabled>Choose block</option>{blocks.map((block) => <option key={block.id} value={block.id}>Block {block.code}</option>)}</select></label>
      <label className="field"><span>Area *</span><select name="area" required defaultValue="Corridor">{["Corridor","Balcony","Lobby","Common Bathroom","Staircase","Drying Area","Visitor Room","Utility Room","Pantry","Room","Other"].map((area) => <option key={area}>{area}</option>)}</select></label>
      <label className="field field-wide"><span>Room / Exact Location *</span><input name="location" required maxLength={120} placeholder="e.g. Block C Level 3 corridor, near lift"/></label>
      <label className="field"><span>Defect Type *</span><select name="defectType" required defaultValue="Lighting">{["Lighting","Water Leakage","Door / Lock","Plumbing","Furniture","Air Conditioning","Cleaning Issue","Other"].map((type) => <option key={type}>{type}</option>)}</select></label>
      <label className="field"><span>Priority *</span><select name="priority" required defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
      <label className="field field-wide"><span>Description *</span><textarea name="description" required minLength={3} maxLength={3000} rows={5} placeholder="Explain what is broken and where it is."/></label>
    </div>
    <section className="cleaner-photo-section">
      <div><span>Evidence Photo *</span><small>Choose one option. The photo is private and visible to authorized staff only.</small></div>
      <div className="cleaner-photo-actions">
        <label className={`cleaner-photo-button${photoSource === "camera" ? " selected" : ""}`}><Camera size={22}/><span>Take Photo</span><input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => choosePhoto(event.target.files?.[0], "camera")}/></label>
        <label className={`cleaner-photo-button${photoSource === "upload" ? " selected" : ""}`}><ImageUp size={22}/><span>Upload Photo</span><input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0], "upload")}/></label>
      </div>
      {photo && <p className="cleaner-photo-selected">✓ {photoSource === "camera" ? "Photo taken" : "Photo selected"} · {photo.name}</p>}
    </section>
    <button className="button cleaner-report-submit" type="submit" disabled={busy}><Send size={18}/>{busy ? "Sending..." : "Send to Admin"}</button>
  </form>;
}
