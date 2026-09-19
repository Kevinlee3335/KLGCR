"use client";

import { Camera, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Leave room for multipart fields below the default Server Action request limit.
const MAX_PHOTO_BYTES = 750 * 1024;

async function preparePhoto(source: File): Promise<File> {
  if (!source.type.startsWith("image/")) throw new Error("Please select an image.");
  if (source.size > 30 * 1024 * 1024) throw new Error("Please choose a photo smaller than 30 MB.");
  const url = URL.createObjectURL(source);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable. Please try another browser.");
    for (let edge = 1600; edge >= 400; edge = Math.floor(edge * 0.75)) {
      const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8));
      if (blob && blob.size <= MAX_PHOTO_BYTES) {
        return new File([blob], "completion.jpg", { type: "image/jpeg" });
      }
    }
    throw new Error("This photo is too large. Please choose another photo.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CompletionPhotoPicker() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef<HTMLInputElement>(null);
  const version = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const form = submittedRef.current?.form;
    const guard = (event: Event) => {
      if (busy || !file) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setError(busy ? "Please wait while the photo is prepared." : "Please add a completion photo.");
      }
    };
    form?.addEventListener("submit", guard, true);
    return () => form?.removeEventListener("submit", guard, true);
  }, [busy, file]);

  const clear = () => {
    version.current++;
    if (cameraRef.current) cameraRef.current.value = "";
    if (uploadRef.current) uploadRef.current.value = "";
    if (submittedRef.current) submittedRef.current.value = "";
    setFile(null);
    setBusy(false);
    setError("");
  };

  const choose = async (source?: File) => {
    if (!source) return;
    clear();
    const current = version.current;
    setBusy(true);
    try {
      const ready = await preparePhoto(source);
      if (current !== version.current) return;
      const transfer = new DataTransfer();
      transfer.items.add(ready);
      if (!submittedRef.current) return;
      submittedRef.current.files = transfer.files;
      setFile(ready);
    } catch (cause) {
      if (current !== version.current) return;
      setError(cause instanceof Error ? cause.message : "Unable to prepare photo. Please use JPG or PNG.");
    } finally {
      if (current === version.current) setBusy(false);
    }
  };

  return <div className="completion-photo-picker">
    <div className="completion-photo-heading"><strong>📷 Completion Photo *</strong><span>Take a new photo or choose one from your phone.</span></div>
    <input ref={submittedRef} type="file" name="completionPhoto" hidden aria-hidden="true"/>
    <input ref={cameraRef} className="visually-hidden-file" type="file" accept="image/*" capture="environment" onChange={e => void choose(e.target.files?.[0])}/>
    <input ref={uploadRef} className="visually-hidden-file" type="file" accept="image/*" onChange={e => void choose(e.target.files?.[0])}/>
    <div className="completion-photo-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={() => cameraRef.current?.click()}><Camera size={18}/>Take Photo</button>
      <button type="button" className="button secondary" disabled={busy} onClick={() => uploadRef.current?.click()}><ImagePlus size={18}/>Upload Photo</button>
    </div>
    {busy && <p role="status">Preparing photo… Please wait.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {preview && file && <div className="completion-photo-preview"><img src={preview} alt="Completion preview"/><div><strong>{file.name}</strong><small>{Math.max(1, Math.round(file.size / 1024))} KB</small><button type="button" onClick={clear}><X size={15}/>Remove</button></div></div>}
  </div>;
}
