import {
  parseCheckoutPdfPages,
  parseCheckoutPdfDetailHeading,
  type CheckoutPdfPage,
  type CheckoutPdfParseResult,
} from "@/lib/checkout-pdf-parser";
import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";

export const MAX_CHECKOUT_PDF_BYTES = 50 * 1024 * 1024;
export const MAX_CHECKOUT_PDF_PAGES = 250;
const MAX_PHOTO_PIXELS = 24_000_000;
const MAX_EXTRACTED_PHOTO_BYTES = 120 * 1024 * 1024;
const PIXELS_PER_CHUNK = 64 * 1024;
const MAIN_THREAD_BUDGET_MS = 12;

export type CheckoutPdfPhoto = {
  file: File;
  label: "before" | "after" | "recheck";
  sourcePage: number;
};
export type CheckoutPdfProgress = {
  page: number;
  totalPages: number;
  message: string;
  phase?: "opening" | "reading" | "photos" | "validating" | "complete";
  photos?: number;
  photoBytes?: number;
};
export type CheckoutPdfBrowserResult = Omit<CheckoutPdfParseResult, "rooms"> & {
  sourceFileName: string;
  sourceSha256: string;
  rooms: (Omit<CheckoutPdfParseResult["rooms"][number], "defects"> & {
    defects: (Omit<CheckoutPdfParseResult["rooms"][number]["defects"][number], "photos"> & {
      photos: CheckoutPdfPhoto[];
    })[];
  })[];
};

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export type PdfPhotoBox = { xMin: number; xMax: number; yMin: number; yMax: number; image: unknown };
export type PdfTextPosition = { text: string; x: number; y: number; width?: number };
function photoIdentity(blockCode: string, roomNo: string, sourceId: string) {
  return `${blockCode.toUpperCase()}:${roomNo.toUpperCase().replace(/[ -]/g, "")}:${sourceId}`;
}

function multiply(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1], left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3], left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}
function box(matrix: Matrix, image: unknown): PdfPhotoBox {
  const x = [matrix[4], matrix[0] + matrix[4], matrix[2] + matrix[4], matrix[0] + matrix[2] + matrix[4]];
  const y = [matrix[5], matrix[1] + matrix[5], matrix[3] + matrix[5], matrix[1] + matrix[3] + matrix[5]];
  return { xMin: Math.min(...x), xMax: Math.max(...x), yMin: Math.min(...y), yMax: Math.max(...y), image };
}

/** PDF user-space coordinates are retained: a larger y is closer to the page top. */
export function groupCheckoutPdfLines(items: readonly PdfTextPosition[]): PdfTextPosition[] {
  const rows: { y: number; items: PdfTextPosition[] }[] = [];
  for (const item of [...items].filter(item => item.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.y - item.y) <= 1.5) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows.map(row => {
    const sorted = row.items.sort((a, b) => a.x - b.x);
    return { text: sorted.map(item => item.text.trim()).join(" ").replace(/\s+/g, " ").trim(), x: sorted[0].x, y: row.y };
  });
}

/** Track the graphics-state stack rather than confusing screen coordinates with PDF image dimensions. */
export function checkoutPdfImageBoxes(
  operatorList: { fnArray: number[]; argsArray: unknown[][] },
  ops: { save: number; restore: number; transform: number; paintImageXObject: number; paintInlineImageXObject: number; paintImageXObjectRepeat: number },
): PdfPhotoBox[] {
  const images: PdfPhotoBox[] = [];
  const stack: Matrix[] = [];
  let matrix: Matrix = [...IDENTITY];
  for (let i = 0; i < operatorList.fnArray.length; i++) {
    const op = operatorList.fnArray[i];
    const args = operatorList.argsArray[i] || [];
    if (op === ops.save) stack.push([...matrix]);
    else if (op === ops.restore) matrix = stack.pop() || [...IDENTITY];
    else if (op === ops.transform) matrix = multiply(matrix, args as Matrix);
    else if (op === ops.paintImageXObject || op === ops.paintInlineImageXObject) images.push(box(matrix, args[0]));
    else if (op === ops.paintImageXObjectRepeat) {
      const [image, sx, sy, positions] = args as [unknown, number, number, number[]];
      for (let j = 0; j < positions.length; j += 2) {
        images.push(box(multiply(matrix, [sx, 0, 0, sy, positions[j], positions[j + 1]]), image));
      }
    }
  }
  return images;
}

type Anchor = { sourceId: string; y: number; evidenceKey?: string; supported?: boolean };
type PreviousSource = { sourceId: string; evidenceKey?: string; supported?: boolean };
const photoCaptionPattern = /^(?:(?:sebelum|selepas)(?:\s+\d+)?|semakan\s+semula(?:\s*\([^)]*\))?)$/i;

function sourceAbove(y: number, anchors: readonly Anchor[], previousSource?: PreviousSource) {
  return anchors.filter(anchor => anchor.y > y).sort((a, b) => a.y - b.y)[0] || previousSource;
}
function sourceIdentity(source: PreviousSource) { return source.evidenceKey || source.sourceId; }
function photoCaption(image: PdfPhotoBox, labels: readonly PdfTextPosition[]) {
  const centerX = (image.xMin + image.xMax) / 2;
  return labels.filter(item => photoCaptionPattern.test(item.text.trim())
    && item.y <= image.yMax + 8 && item.y >= image.yMin - 65
    && Math.abs(item.x + (item.width || 0) / 2 - centerX) <= Math.max(50, (image.xMax - image.xMin) * 0.6))
    .sort((a, b) => Math.abs(a.x + (a.width || 0) / 2 - centerX) - Math.abs(b.x + (b.width || 0) / 2 - centerX))[0];
}
function captionLabel(caption: PdfTextPosition): CheckoutPdfPhoto["label"] {
  return /^sebelum\b/i.test(caption.text.trim()) ? "before" : /^semakan\b/i.test(caption.text.trim()) ? "recheck" : "after";
}

export function checkoutPdfPhotoTarget(
  image: PdfPhotoBox,
  anchors: readonly Anchor[],
  labels: readonly PdfTextPosition[],
  previousSource?: string | PreviousSource,
): { sourceId: string; label: "before" | "after" | "recheck"; evidenceKey?: string } | null {
  const centerY = (image.yMin + image.yMax) / 2;
  const fallback = typeof previousSource === "string" ? { sourceId: previousSource } : previousSource;
  const source = sourceAbove(centerY, anchors, fallback);
  if (!source) return null;
  // Before/After is read from the report's own caption; a photograph alone never means repaired.
  const caption = photoCaption(image, labels);
  if (!caption) return null;
  const captionSource = sourceAbove(caption.y, anchors, fallback);
  if (!captionSource || sourceIdentity(captionSource) !== sourceIdentity(source)) return null;
  return { sourceId: source.sourceId, label: captionLabel(caption), ...(source.evidenceKey ? { evidenceKey: source.evidenceKey } : {}) };
}

/** PDF.js may return a partial operator list after a decoding error. Verify the report's visible evidence slots as well. */
export function checkoutPdfMissingPhotoCaptions(
  images: readonly PdfPhotoBox[],
  anchors: readonly Anchor[],
  positions: readonly PdfTextPosition[],
  previousSource?: PreviousSource,
): { sourceId: string; label: CheckoutPdfPhoto["label"]; caption: PdfTextPosition }[] {
  const matched = new Set<PdfTextPosition>();
  for (const image of images) {
    if (checkoutPdfPhotoTarget(image, anchors, positions, previousSource)) {
      const caption = photoCaption(image, positions);
      if (caption) matched.add(caption);
    }
  }
  const captions = positions.filter(item => photoCaptionPattern.test(item.text.trim()));
  const emptySlots = new Set<PdfTextPosition>();
  for (const placeholder of positions.filter(item => /^tiada\s+gambar$/i.test(item.text.trim()))) {
    const owner = sourceAbove(placeholder.y, anchors, previousSource);
    if (!owner || owner.supported === false) continue;
    const centerX = placeholder.x + (placeholder.width || 0) / 2;
    const closestCaption = captions.filter(caption => placeholder.y >= caption.y - 2 && placeholder.y <= caption.y + 75
      && Math.abs(caption.x + (caption.width || 0) / 2 - centerX) <= 45
      && (() => { const source = sourceAbove(caption.y, anchors, previousSource); return source && sourceIdentity(source) === sourceIdentity(owner); })())
      .sort((a, b) => Math.abs(placeholder.y - a.y) - Math.abs(placeholder.y - b.y))[0];
    // One placeholder represents one slot, even if two captions are unusually close together.
    if (closestCaption) emptySlots.add(closestCaption);
  }
  return captions.flatMap(caption => {
    if (matched.has(caption) || emptySlots.has(caption)) return [];
    const source = sourceAbove(caption.y, anchors, previousSource);
    if (!source || source.supported === false) return [];
    return [{ sourceId: source.sourceId, label: captionLabel(caption), caption }];
  });
}

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("PDF reading was cancelled.", "AbortError");
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  ensureNotAborted(signal);
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException("PDF reading was cancelled.", "AbortError")); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}

/** A real task boundary lets the browser paint progress and handle a Cancel click. */
export async function yieldCheckoutPdfToBrowser(signal?: AbortSignal): Promise<void> {
  ensureNotAborted(signal);
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  const nextTask = scheduler?.yield
    ? scheduler.yield()
    : new Promise<void>(resolve => setTimeout(resolve, 0));
  await abortable(nextTask, signal);
  ensureNotAborted(signal);
}

function cooperativeWork(signal?: AbortSignal) {
  let lastPause = performance.now();
  return {
    async pause(force = false) {
      ensureNotAborted(signal);
      if (force || performance.now() - lastPause >= MAIN_THREAD_BUDGET_MS) {
        await yieldCheckoutPdfToBrowser(signal);
        lastPause = performance.now();
      }
    },
  };
}

export type DecodedPdfImage = { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8Array | Uint8ClampedArray; kind?: number };
function decodedImage(page: PDFPageProxy, reference: unknown, signal?: AbortSignal): Promise<DecodedPdfImage> {
  if (reference && typeof reference === "object") return Promise.resolve(reference as DecodedPdfImage);
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error: Error | null, data?: DecodedPdfImage) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else if (data) resolve(data);
      else reject(new Error("An embedded report photo could not be decoded."));
    };
    const abort = () => finish(new DOMException("PDF reading was cancelled.", "AbortError"));
    const timeout = setTimeout(() => finish(new Error("An embedded report photo took too long to read. Try again.")), 20_000);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    try {
      const objects = String(reference).startsWith("g_") ? page.commonObjs : page.objs;
      objects.get(String(reference), (value: DecodedPdfImage) => finish(null, value));
    } catch (error) { finish(error instanceof Error ? error : new Error("Unable to decode a report photo.")); }
  });
}

export async function encodeCheckoutPdfPhoto(image: DecodedPdfImage, name: string, signal?: AbortSignal): Promise<File> {
  ensureNotAborted(signal);
  const { width, height } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PHOTO_PIXELS) {
    throw new Error("A report photo is too large to process safely. Upload a smaller PDF extract.");
  }
  const canvas = document.createElement("canvas");
  const work = cooperativeWork(signal);
  try {
    // Keep the full embedded resolution: these are evidence photos, not thumbnails of the PDF page.
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the report photos.");
    await work.pause(true);
    if (image.bitmap) context.drawImage(image.bitmap, 0, 0);
    else if (image.data) {
      const rgba = new Uint8ClampedArray(width * height * 4);
      const pixels = width * height;
      const stride = Math.ceil(width / 8);
      const kind = image.kind === 1 ? 1 : image.data.length === pixels * 4 ? 3 : image.data.length === pixels * 3 ? 2 : 0;
      if (!kind || (kind === 1 && image.data.length !== stride * height)) throw new Error("An embedded photo contains incomplete or unsupported pixel data.");
      for (let start = 0; start < pixels; start += PIXELS_PER_CHUNK) {
        ensureNotAborted(signal);
        const end = Math.min(start + PIXELS_PER_CHUNK, pixels);
        if (kind === 3) rgba.set(image.data.subarray(start * 4, end * 4), start * 4);
        else for (let pixel = start; pixel < end; pixel++) {
          const j = pixel * 4;
          if (kind === 2) {
            const i = pixel * 3;
            rgba[j] = image.data[i]; rgba[j + 1] = image.data[i + 1]; rgba[j + 2] = image.data[i + 2];
          } else {
            const y = Math.floor(pixel / width), x = pixel - y * width;
            const value = image.data[y * stride + (x >> 3)] & (128 >> (x & 7)) ? 255 : 0;
            rgba[j] = value; rgba[j + 1] = value; rgba[j + 2] = value;
          }
          rgba[j + 3] = 255;
        }
        await work.pause();
      }
      context.putImageData(new ImageData(rgba, width, height), 0, 0);
    } else throw new Error("The PDF contains an unreadable photo. Please export the report with its photos embedded.");
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    await work.pause(true);
    const blob = await abortable(new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Unable to prepare a report photo.")), "image/jpeg", 0.96)), signal);
    ensureNotAborted(signal);
    return new File([blob], name, { type: blob.type });
  } finally { canvas.width = 0; canvas.height = 0; }
}

/** Read the PDF locally; only reviewed records and individual photos are subsequently sent to KLGCR. */
export async function readCheckoutPdf(
  file: File,
  onProgress?: (progress: CheckoutPdfProgress) => void,
  signal?: AbortSignal,
): Promise<CheckoutPdfBrowserResult> {
  ensureNotAborted(signal);
  if (!/\.pdf$/i.test(file.name) || !file.size || file.size > MAX_CHECKOUT_PDF_BYTES) {
    throw new Error("Choose a PDF report up to 50 MB.");
  }
  onProgress?.({ page: 0, totalPages: 0, message: "Opening PDF report…", phase: "opening", photos: 0, photoBytes: 0 });
  await yieldCheckoutPdfToBrowser(signal);
  const bytes = new Uint8Array(await abortable(file.arrayBuffer(), signal));
  if (new TextDecoder("ascii").decode(bytes.subarray(0, 1024)).indexOf("%PDF-") < 0) throw new Error("This file is not a valid PDF report.");
  ensureNotAborted(signal);
  const sourceSha256 = Array.from(new Uint8Array(await abortable(crypto.subtle.digest("SHA-256", bytes), signal))).map(byte => byte.toString(16).padStart(2, "0")).join("");
  const pdfjs = await abortable(import("pdfjs-dist/legacy/build/pdf.mjs"), signal);
  pdfjs.GlobalWorkerOptions.workerSrc = `/api/checkout-pdf-worker?v=${pdfjs.version}`;
  const loading = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true, disableFontFace: true, stopAtErrors: true, maxImageSize: MAX_PHOTO_PIXELS });
  const abort = () => { void loading.destroy().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  const pages: CheckoutPdfPage[] = [];
  const photos = new Map<string, CheckoutPdfPhoto[]>();
  const warnings: string[] = [];
  let previousSource: { sourceId: string; evidenceKey?: string; supported: boolean } | undefined;
  let totalPhotoBytes = 0;
  let totalPhotos = 0;
  let lastProgressAt = -Infinity;
  const progress = (page: number, totalPages: number, phase: NonNullable<CheckoutPdfProgress["phase"]>, message: string, force = false) => {
    const now = performance.now();
    if (force || now - lastProgressAt >= 60) {
      lastProgressAt = now;
      onProgress?.({ page, totalPages, phase, message, photos: totalPhotos, photoBytes: totalPhotoBytes });
    }
  };
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > MAX_CHECKOUT_PDF_PAGES) throw new Error("Upload a report with no more than 250 pages, or split it into smaller PDFs.");
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      ensureNotAborted(signal);
      progress(pageNumber, pdf.numPages, "reading", `Reading page ${pageNumber} of ${pdf.numPages}…`, true);
      await yieldCheckoutPdfToBrowser(signal);
      const page = await pdf.getPage(pageNumber);
      try {
        const text = await page.getTextContent();
        const positions: PdfTextPosition[] = text.items.flatMap(item => "str" in item && item.str.trim()
          ? [{ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width }] : []);
        const lines = groupCheckoutPdfLines(positions);
        // A new room's table must not inherit the last detail from the preceding room.
        if (lines.some(line => /REKOD\s+KEROSAKAN\s+BILIK|RINGKASAN\s+MENGIKUT\s+BILIK/i.test(line.text))) previousSource = undefined;
        const viewport = page.getViewport({ scale: 1 });
        pages.push({ pageNumber, width: viewport.width, height: viewport.height, lines });
        const anchors = lines.flatMap(line => {
          const detail = parseCheckoutPdfDetailHeading(line.text);
          return detail ? [{ sourceId: detail.sourceId, y: line.y, evidenceKey: photoIdentity(detail.blockCode, detail.roomNo, detail.sourceId), supported: /^[AB]$/i.test(detail.blockCode) }] : [];
        });
        // The report's summary/header must never supply a photo association.
        const operatorList = await page.getOperatorList();
        const boxes = checkoutPdfImageBoxes(operatorList, pdfjs.OPS);
        const missingPhotos = checkoutPdfMissingPhotoCaptions(boxes, anchors, positions, previousSource);
        if (missingPhotos.length) {
          const missing = missingPhotos[0];
          throw new Error(`Page ${pageNumber} · ${missing.sourceId}: the ${missing.label} photo is missing or could not be decoded. No forms have been created from this upload. Re-export this report with its photos embedded, using photos up to 24 million pixels.`);
        }
        for (const image of boxes) {
          const target = checkoutPdfPhotoTarget(image, anchors, positions, previousSource);
          if (!target) {
            // A small object may be an icon, but a captioned evidence photo is never discarded for its display size.
            if (image.xMax - image.xMin < 25 || image.yMax - image.yMin < 25) continue;
            if (anchors.some(anchor => anchor.supported) || previousSource?.supported) {
              throw new Error(`Page ${pageNumber}: a defect photo could not be matched safely to its source record and caption. No forms have been created from this upload. Check this page in the original report.`);
            }
            continue;
          }
          const detailAnchor = anchors.find(anchor => anchor.sourceId === target.sourceId);
          if (detailAnchor ? !detailAnchor.supported : !previousSource?.supported) continue;
          const decoded = await decodedImage(page, image.image, signal);
          ensureNotAborted(signal);
          const key = target.evidenceKey || target.sourceId;
          const list = photos.get(key) || [];
          const photo = await encodeCheckoutPdfPhoto(decoded, `${target.sourceId}-${target.label}-${list.length + 1}.jpg`, signal);
          totalPhotoBytes += photo.size;
          if (totalPhotoBytes > MAX_EXTRACTED_PHOTO_BYTES) throw new Error("This report contains too many large photos for one upload. Split it into smaller PDFs.");
          list.push({ file: photo, label: target.label, sourcePage: pageNumber });
          photos.set(key, list);
          totalPhotos++;
          progress(pageNumber, pdf.numPages, "photos", `Reading page ${pageNumber} of ${pdf.numPages} · ${totalPhotos} photos prepared…`);
        }
        if (anchors.length) previousSource = anchors[anchors.length - 1];
      } finally { page.cleanup(); }
    }
    ensureNotAborted(signal);
    progress(pdf.numPages, pdf.numPages, "validating", "Checking room totals and defect references…", true);
    await yieldCheckoutPdfToBrowser(signal);
    const parsed = parseCheckoutPdfPages(pages);
    if (parsed.blockingErrors.length) {
      const details = parsed.blockingErrors.slice(0, 4).join(" ");
      throw new Error(`The PDF is incomplete or inconsistent. No forms have been created from this upload. ${details}${parsed.blockingErrors.length > 4 ? " Check the full source report for the remaining mismatches." : ""}`);
    }
    if (!parsed.rooms.length) throw new Error("No Block A/B defect details were found. Upload the UTMSPACE room defect report including its detailed findings, rather than a summary or scanned image.");
    progress(pdf.numPages, pdf.numPages, "complete", `${parsed.rooms.length} rooms · ${parsed.rooms.reduce((count, room) => count + room.defects.length, 0)} defects · ${totalPhotos} photos ready for review.`, true);
    return {
      ...parsed,
      sourceFileName: file.name,
      sourceSha256,
      warnings: [...new Set([...parsed.warnings, ...warnings])],
      rooms: parsed.rooms.map(room => ({ ...room, defects: room.defects.map(defect => ({ ...defect, photos: photos.get(photoIdentity(room.blockCode, room.roomNo, defect.sourceId)) || [] })) })),
    };
  } catch (error) {
    if (signal?.aborted) throw new DOMException("PDF reading was cancelled.", "AbortError");
    if (error instanceof Error && /password/i.test(error.message)) throw new Error("This PDF is password protected. Export an unlocked copy of the report.");
    if (error instanceof Error && /Image exceeded maximum allowed size/i.test(error.message)) throw new Error("A photo in this PDF exceeds 24 million pixels. No forms have been created from this upload. Export the report with smaller embedded photos or upload a smaller report extract.");
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    await loading.destroy().catch(() => {});
  }
}
