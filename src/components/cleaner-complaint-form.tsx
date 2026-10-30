"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { cancelCleanerComplaint, finalizeCleanerComplaint, prepareCleanerComplaint } from "@/app/(dashboard)/staff/complaints/new/actions";
import { createClient } from "@/lib/supabase/client";

import { EvidencePhotoPicker } from "@/components/evidence-photo-picker";
import { validateEvidenceFiles } from "@/lib/photo-limits";

type Block = { id: number; code: string };
const commonAreaLocations = ["Balcony", "Corridor", "Common Bathroom", "Visitor Room", "Drying Area", "Lobby", "Lift", "Staircase", "Utility Room", "Pantry", "Kitchen Block C", "Kitchen Block D", "Other"];
const externalAreas = ["Bungalow XA3/X3", "Futsal", "Car Park", "Gazebo", "KLG Security Main Post", "Commercial Centre", "Gymnasium", "Outdoor Exercise Station", "Substation PE45/46"];
const defectItems = {
  room: ["Door Handle", "Door Closer", "Door Lock / Key", "Ceiling Fan", "Air Conditioning", "Lighting", "Divan", "Headboard", "Mattress", "Study Table", "Utility Table", "Chair", "Bookshelf", "Wardrobe", "Curtain", "Curtain Hook / Holder", "Floor", "Wall", "Other"],
  bathroom: ["Door Knob", "Water Tap / Sink Tap", "Shower Valve", "Toilet Seat", "Flexible Hose", "Other"],
  common: ["Lighting", "Water Leakage", "Cleaning Issue", "Other"],
  external: ["Lighting", "Water Leakage", "Door / Lock", "Plumbing", "Furniture", "Air Conditioning", "Cleaning Issue", "Other"],
} as const;

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
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [locationType, setLocationType] = useState<"room" | "bathroom" | "common" | "external">("common");
  const [area, setArea] = useState("Corridor");
  const [defectType, setDefectType] = useState("Lighting");
  const needsOtherDetails = area === "Other" || defectType === "Other";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validateEvidenceFiles(photos)) {
      setError(validateEvidenceFiles(photos)!);
      return;
    }
    setBusy(true);
    setError("");
    let prepared: Awaited<ReturnType<typeof prepareCleanerComplaint>> | null = null;
    try {
      const formData = new FormData(event.currentTarget);
      prepared = await prepareCleanerComplaint(formData, photos.length);
      if ("error" in prepared) {
        setError(prepared.error ?? "Unable to prepare the complaint.");
        return;
      }
      const supabase = createClient();
      for (let index = 0; index < photos.length; index++) {
        const compressed = await compressPhoto(photos[index]);
        const upload = prepared.uploads[index];
        const { error: uploadError } = await supabase.storage.from("checkout-evidence").uploadToSignedUrl(upload.path, upload.token, compressed);
        if (uploadError) throw new Error(`Photo ${index + 1}: ${uploadError.message}`);
      }
      const finalized = await finalizeCleanerComplaint(prepared.complaintId, prepared.uploads.map(upload => upload.path));
      if ("error" in finalized) {
        setError(finalized.error ?? "Unable to finish sending the complaint.");
        return;
      }
      router.replace(`/staff/complaints/new?created=${encodeURIComponent(finalized.complaintNo)}`);
      router.refresh();
    } catch (cause) {
      if (prepared && !("error" in prepared)) await cancelCleanerComplaint(prepared.complaintId, prepared.uploads.map(upload => upload.path));
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
      <label className="field"><span>Location Type *</span><select name="locationType" value={locationType} onChange={(event) => { const next = event.target.value as "room" | "bathroom" | "common" | "external"; setLocationType(next); setArea(next === "common" ? "Corridor" : next === "external" ? externalAreas[0] : next === "room" ? "Room" : "Bathroom"); setDefectType(defectItems[next][0]); }}><option value="room">Room</option><option value="bathroom">Bathroom</option><option value="common">Common Area</option><option value="external">External Area</option></select></label>
      {locationType !== "external" && <label className="field"><span>Block *</span><select name="blockId" required defaultValue=""><option value="" disabled>Choose block</option>{blocks.map((block) => <option key={block.id} value={block.id}>Block {block.code}</option>)}</select></label>}
      {locationType === "common" && <label className="field"><span>Common Area *</span><select name="area" required value={area} onChange={(event) => setArea(event.target.value)}>{commonAreaLocations.map((option) => <option key={option}>{option}</option>)}</select></label>}
      {locationType === "external" && <label className="field"><span>External Area *</span><select name="area" required value={area} onChange={(event) => setArea(event.target.value)}>{externalAreas.map((option) => <option key={option}>{option}</option>)}</select></label>}
      {["room", "bathroom"].includes(locationType) && <input type="hidden" name="area" value={area}/>}
      <label className="field field-wide"><span>{locationType === "room" ? "Room No. *" : locationType === "bathroom" ? "Room No. / Bathroom Location *" : "Room / Exact Location"}</span><input name="location" required={["room", "bathroom"].includes(locationType)} maxLength={120} placeholder={locationType === "room" ? "e.g. A205" : locationType === "bathroom" ? "e.g. A205 bathroom" : "e.g. Block C Level 3 corridor, near lift"}/></label>
      <label className="field"><span>Defect Item *</span><select name="defectType" required value={defectType} onChange={(event) => setDefectType(event.target.value)}>{defectItems[locationType].map((option) => <option key={option}>{option}</option>)}</select></label>
      <label className="field"><span>Priority *</span><select name="priority" required defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
      <label className="field field-wide"><span>{needsOtherDetails ? "Describe Other Problem *" : "Description"}</span><textarea name="description" required={needsOtherDetails} maxLength={3000} rows={5} placeholder={needsOtherDetails ? "Write the problem clearly." : "Explain what is broken and where it is."}/></label>
    </div>
    <EvidencePhotoPicker photos={photos} onChange={setPhotos} disabled={busy} label="Evidence photos"/>
    <button className="button cleaner-report-submit" type="submit" disabled={busy}><Send size={18}/>{busy ? "Sending..." : "Send to Admin"}</button>
  </form>;
}
