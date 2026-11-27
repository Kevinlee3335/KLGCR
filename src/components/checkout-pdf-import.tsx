"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LoaderCircle, Upload, X } from "lucide-react";
import { prepareCheckoutPdfRoom, finishCheckoutPdfRoom } from "@/app/(dashboard)/admin/checkouts/pdf-actions";
import type { CheckoutPdfRoomInput } from "@/lib/checkout-pdf-import";
import type { CheckoutPdfBrowserResult, CheckoutPdfPhoto } from "@/lib/checkout-pdf-browser";
import { CHECKOUT_PHOTO_UPLOAD_CONCURRENCY, mapCheckoutPhotos } from "@/lib/checkout-photo-uploads";
import { createClient } from "@/lib/supabase/client";
import styles from "./checkout-pdf-import.module.css";

type Room = CheckoutPdfBrowserResult["rooms"][number];
type Outcome = { created: boolean; roomId?: string; reason?: string };
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const roomKey = (room: Pick<Room, "blockCode" | "roomNo">) => `${room.blockCode}:${room.roomNo}`;
const defectKey = (room: Room, sourceId: string) => `${roomKey(room)}:${sourceId}`;
const sourcePhotoLabel = (photo: CheckoutPdfPhoto) => ({ before: "Source Before photo", after: "Source After photo", recheck: "Source recheck photo" })[photo.label];
function photoType(type: string): "image/jpeg" | "image/png" | "image/webp" {
  if (type === "image/jpeg" || type === "image/png" || type === "image/webp") return type;
  throw new Error("A source photo has an unsupported format. Read the PDF again.");
}

function SourcePhoto({ photo, title, onOpen }: { photo: CheckoutPdfPhoto; title: string; onOpen: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(photo.file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo.file]);
  return <button className={styles.photo} type="button" onClick={onOpen} aria-label={`Open ${photo.label} photo for ${title}`}>
    {url && <img src={url} alt={`${title} - source ${photo.label} photo`} loading="lazy" />}
    <span>{sourcePhotoLabel(photo)}<small>PDF page {photo.sourcePage}</small></span>
  </button>;
}

function PhotoDialog({ photo, title, onClose }: { photo: CheckoutPdfPhoto; title: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(photo.file);
    setUrl(next);
    dialog.current?.showModal();
    return () => URL.revokeObjectURL(next);
  }, [photo.file]);
  return <dialog ref={dialog} className={styles.photoDialog} aria-label="Source defect photo" onClose={onClose}>
    <div className={styles.photoDialogHead}><strong>{title}</strong><button type="button" className={styles.close} aria-label="Close source photo" onClick={() => dialog.current?.close()}><X size={22}/></button></div>
    <p>{sourcePhotoLabel(photo)} · PDF page {photo.sourcePage}</p>
    {url && <img src={url} alt={`${title} - source ${photo.label} photo`} />}
  </dialog>;
}

export function CheckoutPdfImport({ blocks }: { blocks: { id: number; code: string }[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const readController = useRef<AbortController | null>(null);
  const readSequence = useRef(0);
  const [parsed, setParsed] = useState<CheckoutPdfBrowserResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checkedEnglish, setCheckedEnglish] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState<{ photo: CheckoutPdfPhoto; title: string } | null>(null);
  const blockIds = useMemo(() => new Map(blocks.map(block => [block.code.replace(/^block\s*/i, "").trim().toUpperCase(), block.id])), [blocks]);

  useEffect(() => () => readController.current?.abort(), []);
  const chosen = parsed?.rooms.filter(room => selected.has(roomKey(room))) || [];
  const pending = chosen.filter(room => !outcomes[roomKey(room)]);
  const photoCount = chosen.reduce((sum, room) => sum + room.defects.reduce((count, defect) => count + defect.photos.length, 0), 0);
  const defectCount = chosen.reduce((sum, room) => sum + room.defects.length, 0);
  const reviewNeeded = pending.some(room => room.defects.some(defect => defect.needsReview && !checkedEnglish.has(defectKey(room, defect.sourceId))));
  const invalidEnglish = pending.some(room => room.defects.some(defect => !defect.description.trim() || !defect.title.trim()));
  const oversizedRooms = pending.filter(room => room.defects.length > 50 || room.defects.reduce((count, defect) => count + defect.photos.length, 0) > 20);
  const created = Object.values(outcomes).filter(outcome => outcome.created).length;
  const skipped = Object.values(outcomes).filter(outcome => !outcome.created).length;
  const busy = reading || saving;

  function cancelRead() {
    readSequence.current++;
    readController.current?.abort();
    setReading(false);
    setProgress("");
  }

  async function selectFile(file?: File) {
    if (!file || saving) return;
    readController.current?.abort();
    const sequence = ++readSequence.current;
    const controller = new AbortController();
    readController.current = controller;
    setParsed(null); setSelected(new Set()); setCheckedEnglish(new Set()); setOutcomes({}); setError(""); setZoom(null);
    if (!/\.pdf$/i.test(file.name) || file.size === 0 || file.size > MAX_PDF_BYTES) {
      setError("Choose a PDF report up to 50 MB.");
      return;
    }
    setReading(true); setProgress("Reading the PDF report…");
    try {
      const { readCheckoutPdf } = await import("@/lib/checkout-pdf-browser");
      const result = await readCheckoutPdf(file, status => {
        if (sequence === readSequence.current) setProgress(status.message || `Reading PDF page ${status.page} of ${status.totalPages}…`);
      }, controller.signal);
      if (sequence !== readSequence.current) return;
      if (!result.rooms.length) throw new Error("No Block A or B rooms with defect details were found. Upload the original UTMSPACE PDF report.");
      setParsed(result);
      setSelected(new Set(result.rooms.map(roomKey)));
      setProgress("");
    } catch (cause) {
      if (sequence === readSequence.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to read this PDF. Please try the original UTMSPACE report.");
    } finally {
      if (sequence === readSequence.current) setReading(false);
    }
  }

  function updateEnglish(key: string, sourceId: string, field: "title" | "description", value: string) {
    setParsed(current => current ? { ...current, rooms: current.rooms.map(room => roomKey(room) === key ? { ...room, defects: room.defects.map(defect => defect.sourceId === sourceId ? { ...defect, [field]: value } : defect) } : room) } : current);
  }

  function makeInput(room: Room): CheckoutPdfRoomInput {
    const blockId = blockIds.get(room.blockCode);
    if (!parsed || !blockId) throw new Error(`Block ${room.blockCode} is not available in this system.`);
    if (room.defects.length > 50 || room.defects.reduce((count, defect) => count + defect.photos.length, 0) > 20) {
      throw new Error(`${room.roomNo} has more than 50 defects or 20 photos. Import a smaller room report.`);
    }
    return {
      blockId, blockCode: room.blockCode, roomNo: room.roomNo, filename: parsed.sourceFileName, fileHash: parsed.sourceSha256,
      defects: room.defects.map(defect => ({
        sourceId: defect.sourceId, inspectionId: defect.inspectionId,
        originalItem: defect.originalItem, originalFinding: defect.originalFinding, originalAction: defect.originalAction,
        sourceStatus: defect.sourceStatus, description: defect.description.trim(), title: defect.title.trim(), reportedDate: defect.reportedDate,
        pageNumber: defect.pageNumber,
        conflictingDetails: defect.conflictingDetails?.map(detail => ({
          originalItem: detail.originalItem, originalFinding: detail.originalFinding, originalAction: detail.originalAction,
          sourceStatus: detail.sourceStatus, pageNumber: detail.pageNumber, y: detail.y,
        })),
        photos: defect.photos.map(photo => ({ label: photo.label, sourcePage: photo.sourcePage, type: photoType(photo.file.type), size: photo.file.size })),
      })),
    };
  }

  async function saveRooms() {
    if (!parsed || busy || !pending.length || reviewNeeded || invalidEnglish || oversizedRooms.length) return;
    setSaving(true); setError("");
    let changed = false;
    try {
      // Validate every selected room before saving the first one.
      const inputs = pending.map(room => ({ room, input: makeInput(room) }));
      for (let index = 0; index < inputs.length; index++) {
        const { room, input } = inputs[index];
        setProgress(`Preparing ${room.roomNo} (${index + 1} of ${inputs.length})…`);
        const prepared = await prepareCheckoutPdfRoom(input);
        if ("error" in prepared) throw new Error(`${room.roomNo}: ${prepared.error}`);
        if ("skipped" in prepared) {
          setOutcomes(current => ({ ...current, [roomKey(room)]: { created: false, roomId: prepared.roomId, reason: prepared.reason } }));
          continue;
        }
        const expectedPhotos = room.defects.reduce((count, defect) => count + defect.photos.length, 0);
        if (prepared.uploads.length !== expectedPhotos) throw new Error(`${room.roomNo}: photo preparation was incomplete. Please retry.`);
        const storage = createClient().storage.from("checkout-evidence");
        let uploaded = 0;
        const paths = await mapCheckoutPhotos(prepared.uploads, CHECKOUT_PHOTO_UPLOAD_CONCURRENCY, async upload => {
          const defect = room.defects.find(item => item.sourceId === upload.sourceId);
          const photo = defect?.photos[upload.photoIndex];
          if (!photo) throw new Error(`${room.roomNo}: a photo reference could not be matched. Please read the report again.`);
          const transfer = await storage.uploadToSignedUrl(upload.path, upload.token, photo.file, { contentType: photo.file.type });
          if (transfer.error) throw new Error(`${room.roomNo}: a photo could not upload. ${transfer.error.message} Please retry.`);
          uploaded++;
          setProgress(`Uploading ${room.roomNo} photos: ${uploaded} of ${expectedPhotos}…`);
          return { path: upload.path, sourceId: upload.sourceId, photoIndex: upload.photoIndex };
        });
        setProgress(`Saving ${room.roomNo} with its defect photos…`);
        const result = await finishCheckoutPdfRoom(input, prepared.importId, paths);
        if ("error" in result) throw new Error(`${room.roomNo}: ${result.error}`);
        changed ||= result.created;
        setOutcomes(current => ({ ...current, [roomKey(room)]: result }));
      }
      setProgress("Selected rooms have been checked. Created forms are ready for maintenance assignment below.");
    } catch (cause) {
      setProgress("");
      setError(cause instanceof Error ? cause.message : "Unable to finish the import. Retry the remaining rooms.");
    } finally {
      setSaving(false);
      if (changed) router.refresh();
    }
  }

  return <section className={`panel checkout-create ${styles.panel}`} aria-labelledby="checkout-pdf-title">
    <div className={styles.head}>
      <div><p className={styles.eyebrow}>UTMSPACE report</p><h3 id="checkout-pdf-title">Upload PDF · Create Defect Forms</h3><p>Room numbers, English defect descriptions and the corresponding photos. Review, create, then assign maintenance staff.</p></div>
      <button type="button" className="button" disabled={busy} onClick={() => { if (fileInput.current) fileInput.current.value = ""; fileInput.current?.click(); }}><Upload size={18}/>Upload PDF</button>
    </div>
    <input ref={fileInput} className={styles.fileInput} type="file" accept=".pdf,application/pdf" aria-label="UTMSPACE PDF report" disabled={busy} onChange={event => void selectFile(event.target.files?.[0])}/>
    {!parsed && !reading && <p className={styles.hint}><FileText size={18}/>Original UTMSPACE reports · Block A &amp; B · PDF up to 50 MB</p>}
    {reading && <div className={styles.progress} role="status"><LoaderCircle size={20} className={styles.spin}/><span>{progress}</span><button className="button secondary" type="button" onClick={cancelRead}>Cancel reading</button></div>}
    {parsed && <>
      <div className={styles.reportName}><FileText size={18}/><strong>{parsed.sourceFileName}</strong><span>Preview</span></div>
      <div className={styles.metrics} aria-label="Selected report totals"><div><strong>{chosen.length}</strong><span>rooms selected</span></div><div><strong>{defectCount}</strong><span>defect items</span></div><div><strong>{photoCount}</strong><span>source photos</span></div></div>
      <p className={styles.hint}>Original report notes and photos are retained. An After photo does not mark a defect completed.</p>
      {parsed.warnings.length > 0 && <div className={styles.notice}><strong>Report notes</strong><ul>{parsed.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
      <div className={styles.selectionTools}><label><input type="checkbox" checked={selected.size === parsed.rooms.length} disabled={saving} onChange={event => setSelected(new Set(event.target.checked ? parsed.rooms.map(roomKey) : []))}/>Select all rooms</label><span>Review the English wording before creating forms.</span></div>
      <div className={styles.roomList}>{parsed.rooms.map((room, roomIndex) => {
        const key = roomKey(room), outcome = outcomes[key];
        return <details key={key} className={styles.room} open={roomIndex === 0 || undefined}>
          <summary><span className={styles.roomName}>Block {room.blockCode} · {room.roomNo}</span><span>{room.defects.length} defect{room.defects.length === 1 ? "" : "s"}</span>{outcome && <span className={styles.outcome}>{outcome.created ? "Created" : "Skipped"}</span>}</summary>
          <div className={styles.roomBody}>
            <label className={styles.roomCheck}><input type="checkbox" checked={selected.has(key)} disabled={saving || Boolean(outcome)} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(key); else next.delete(key); return next; })}/>Include {room.roomNo}</label>
            {outcome && <p className={styles.saved}>{outcome.created ? "Defect Form created. Ready to assign maintenance staff." : outcome.reason || "This room already exists and was skipped."}{outcome.roomId && <> <a href={`/admin/checkouts/${outcome.roomId}`}>Open room</a></>}</p>}
            {room.defects.map(defect => <article key={defect.sourceId} className={styles.defect}>
              <div className={styles.defectHead}><strong>{defect.sourceId}</strong><span>PDF page {defect.pageNumber}</span></div>
              <label className={styles.englishField}>Defect title<input aria-label={`Defect title ${defect.sourceId}`} value={defect.title} maxLength={240} disabled={saving || Boolean(outcome)} onChange={event => updateEnglish(key, defect.sourceId, "title", event.target.value)}/></label>
              <label className={styles.englishField}>English defect description<textarea aria-label={`English defect description ${defect.sourceId}`} value={defect.description} maxLength={2000} rows={2} disabled={saving || Boolean(outcome)} onChange={event => updateEnglish(key, defect.sourceId, "description", event.target.value)}/></label>
              {defect.needsReview && <>{defect.reviewReason && <p className={styles.reviewReason}>{defect.reviewReason}</p>}<label className={styles.reviewCheck}><input type="checkbox" checked={checkedEnglish.has(defectKey(room, defect.sourceId))} disabled={saving || Boolean(outcome)} onChange={event => setCheckedEnglish(current => { const next = new Set(current), reviewKey = defectKey(room, defect.sourceId); if (event.target.checked) next.add(reviewKey); else next.delete(reviewKey); return next; })}/><span>Check and confirm the English wording for this item.</span></label></>}
              <details className={styles.original}><summary>Original report details</summary><dl><div><dt>Item</dt><dd>{defect.originalItem}</dd></div><div><dt>Finding</dt><dd>{defect.originalFinding}</dd></div>{defect.originalAction && <div><dt>Source action / note</dt><dd>{defect.originalAction}</dd></div>}<div><dt>Source status</dt><dd>{defect.sourceStatus || "Not specified"}</dd></div>{defect.inspectionId && <div><dt>Inspection reference</dt><dd>{defect.inspectionId}</dd></div>}{defect.reportedDate && <div><dt>Reported date</dt><dd>{defect.reportedDate}</dd></div>}</dl>{defect.conflictingDetails?.map((detail, index) => <div className={styles.conflict} key={`${detail.pageNumber}:${index}`}><strong>Additional conflicting report entry · PDF page {detail.pageNumber}</strong><dl><div><dt>Item</dt><dd>{detail.originalItem}</dd></div><div><dt>Finding</dt><dd>{detail.originalFinding}</dd></div>{detail.originalAction && <div><dt>Source action / note</dt><dd>{detail.originalAction}</dd></div>}<div><dt>Source status</dt><dd>{detail.sourceStatus || "Not specified"}</dd></div></dl></div>)}</details>
              {defect.photos.length ? <div className={styles.photos}>{defect.photos.map((photo, index) => <SourcePhoto key={`${defect.sourceId}:${index}`} photo={photo} title={defect.title} onOpen={() => setZoom({ photo, title: defect.title })}/>)}</div> : <p className={styles.noPhoto}>No photo included for this item in the PDF.</p>}
            </article>)}
          </div>
        </details>;
      })}</div>
      <div className={styles.footer}>
        {(created > 0 || skipped > 0) && <p role="status">{created} room{created === 1 ? "" : "s"} created{skipped ? ` · ${skipped} existing room${skipped === 1 ? "" : "s"} skipped` : ""}. {pending.length ? "Retry saves only the remaining rooms." : "Created forms are ready for maintenance assignment."}</p>}
        {reviewNeeded && <p className={styles.hint}>Confirm the flagged English descriptions before creating forms.</p>}
        {invalidEnglish && <p className={styles.hint}>Every selected defect needs an English title and description.</p>}
        {oversizedRooms.length > 0 && <p className={styles.hint}>Select a smaller report for {oversizedRooms.map(room => room.roomNo).join(", ")}. Each room supports up to 50 defects and 20 photos.</p>}
        <button type="button" className="button" disabled={busy || !pending.length || reviewNeeded || invalidEnglish || oversizedRooms.length > 0} onClick={() => void saveRooms()}>{saving ? <><LoaderCircle size={18} className={styles.spin}/>Creating Defect Forms…</> : `Create Defect Forms (${pending.length} room${pending.length === 1 ? "" : "s"})`}</button>
      </div>
    </>}
    {saving && <p className={styles.progress} role="status"><LoaderCircle size={20} className={styles.spin}/>{progress}</p>}
    {!reading && !saving && progress && <p className={styles.hint} role="status">{progress}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {zoom && <PhotoDialog photo={zoom.photo} title={zoom.title} onClose={() => setZoom(null)}/>}
  </section>;
}
