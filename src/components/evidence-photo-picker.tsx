"use client";

import { useEffect, useId, useState } from "react";
import { Camera, ImageUp } from "lucide-react";
import { MAX_EVIDENCE_PHOTOS, validateEvidenceFiles } from "@/lib/photo-limits";

function PhotoPreview({ file, number }: { file: File; number: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const value = URL.createObjectURL(file); setUrl(value); return () => URL.revokeObjectURL(value); }, [file]);
  // Local object URLs are temporary previews, never public evidence links.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={`Selected photo ${number}`} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8 }}/> : null;
}

export function EvidencePhotoPicker({ photos, onChange, disabled = false, label = "Completion photos" }: { photos: File[]; onChange: (files: File[]) => void; disabled?: boolean; label?: string }) {
  const id = useId();
  const [error, setError] = useState("");
  function add(input: HTMLInputElement) {
    const incoming = Array.from(input.files || []);
    input.value = "";
    if (!incoming.length) return;
    const combined = [...photos, ...incoming];
    const invalid = validateEvidenceFiles(combined);
    if (invalid) { setError(invalid); return; }
    onChange(combined);
    setError("");
  }
  return <section className="cleaner-photo-section">
    <div><span>{label} *</span><small>Take photos one by one or select multiple from your gallery. Maximum 20 photos.</small></div>
    <div className="cleaner-photo-actions">
      <label className="cleaner-photo-button"><Camera size={22}/><span>Take Photo</span><input id={`${id}-camera`} aria-label="Take Photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={disabled || photos.length >= MAX_EVIDENCE_PHOTOS} onChange={event => add(event.currentTarget)}/></label>
      <label className="cleaner-photo-button"><ImageUp size={22}/><span>Upload Photos</span><input id={`${id}-upload`} aria-label="Upload Photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || photos.length >= MAX_EVIDENCE_PHOTOS} onChange={event => add(event.currentTarget)}/></label>
    </div>
    <p className="cleaner-photo-selected" role="status">{photos.length} / 20 photos selected</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="photo-grid">{photos.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`}><PhotoPreview file={file} number={index + 1}/><small>Photo {index + 1}</small><button type="button" className="button secondary button-compact" disabled={disabled} aria-label={`Remove photo ${index + 1}`} onClick={() => { onChange(photos.filter((_, i) => i !== index)); setError(""); }}>Remove</button></div>)}</div>
  </section>;
}
