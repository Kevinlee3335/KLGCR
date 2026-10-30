"use client";

import { useState, type ReactNode } from "react";
import { EvidencePhotoPicker } from "@/components/evidence-photo-picker";
import { prepareAdminInspectionEvidence } from "@/app/(dashboard)/admin/checkouts/actions";
import { prepareCheckoutEvidence } from "@/app/(dashboard)/staff/checkouts/actions";
import { createClient } from "@/lib/supabase/client";
import { validateEvidenceFiles } from "@/lib/photo-limits";

export function CheckoutCompletionForm({ roomId, kind, action, children, buttonLabel }: { roomId: string; kind: "inspection" | "completion" | "cleaning"; action: (data: FormData) => Promise<void>; children: ReactNode; buttonLabel: string }) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  async function submit(data: FormData) {
    const invalid = kind==="inspection"&&!photos.length?null:validateEvidenceFiles(photos);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError("");
    try {
      data.delete("photoPaths");
      const descriptors=photos.map(file => ({type:file.type,size:file.size}));
      const prepared = kind==="inspection"?await prepareAdminInspectionEvidence(roomId,descriptors):await prepareCheckoutEvidence(roomId, kind, descriptors);
      if ("error" in prepared) throw new Error(prepared.error);
      const storage = createClient().storage.from("checkout-evidence");
      for (let i = 0; i < photos.length; i++) {
        setProgress(`Uploading photo ${i + 1} of ${photos.length}…`);
        const upload = prepared.uploads[i];
        const {error: uploadError} = await storage.uploadToSignedUrl(upload.path, upload.token, photos[i]);
        if (uploadError) throw new Error(`Photo ${i + 1} could not upload: ${uploadError.message}`);
        data.append("photoPaths", upload.path);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload photos. Please try again.");
      setBusy(false); setProgress(""); return;
    }
    setProgress("Saving all photos…");
    // Keep the server redirect outside the upload catch so Next can navigate normally.
    try { await action(data); } finally { setBusy(false); setProgress(""); }
  }
  return <form action={submit}><fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}>{children}<EvidencePhotoPicker label={kind==="inspection"?"Inspection photos (optional)":"Completion photos *"} photos={photos} onChange={setPhotos} disabled={busy}/>{error && <p className="error" role="alert">{error}</p>}{progress && <p role="status">{progress}</p>}<button className="button" disabled={busy}>{busy ? "Saving…" : buttonLabel}</button></fieldset></form>;
}
