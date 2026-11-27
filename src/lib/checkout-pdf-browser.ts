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

export type CheckoutPdfPhoto = {
  file: File;
  label: "before" | "after" | "recheck";
  sourcePage: number;
};
export type CheckoutPdfProgress = { page: number; totalPages: number; message: string };
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
    const row = rows.find(row => Math.abs(row.y - item.y) <= 1.5);
    if (row) row.items.push(item);
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

type Anchor = { sourceId: string; y: number; evidenceKey?: string };
export function checkoutPdfPhotoTarget(
  image: PdfPhotoBox,
  anchors: readonly Anchor[],
  labels: readonly PdfTextPosition[],
  previousSource?: string | { sourceId: string; evidenceKey?: string },
): { sourceId: string; label: "before" | "after" | "recheck"; evidenceKey?: string } | null {
  const centerY = (image.yMin + image.yMax) / 2;
  const header = anchors.filter(anchor => anchor.y > centerY).sort((a, b) => a.y - b.y)[0];
  const fallback = typeof previousSource === "string" ? { sourceId: previousSource } : previousSource;
  const sourceId = header?.sourceId || fallback?.sourceId;
  const evidenceKey = header?.evidenceKey || fallback?.evidenceKey;
  if (!sourceId) return null;
  // Before/After is read from the report's own caption; a photograph alone never means repaired.
  const centerX = (image.xMin + image.xMax) / 2;
  const caption = labels.filter(item => /^(?:(?:sebelum|selepas)(?:\s+\d+)?|semakan\s+semula(?:\s*\([^)]*\))?)$/i.test(item.text.trim())
    && item.y <= image.yMax + 8 && item.y >= image.yMin - 65
    && Math.abs(item.x + (item.width || 0) / 2 - centerX) <= Math.max(50, (image.xMax - image.xMin) * 0.6))
    .sort((a, b) => Math.abs(a.x + (a.width || 0) / 2 - centerX) - Math.abs(b.x + (b.width || 0) / 2 - centerX))[0];
  if (!caption) return null;
  const label = /^sebelum\b/i.test(caption.text.trim()) ? "before" : /^semakan\b/i.test(caption.text.trim()) ? "recheck" : "after";
  return { sourceId, label, ...(evidenceKey ? { evidenceKey } : {}) };
}

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("PDF reading was cancelled.", "AbortError");
}

type DecodedPdfImage = { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8Array | Uint8ClampedArray; kind?: number };
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

async function imageFile(image: DecodedPdfImage, name: string): Promise<File> {
  const { width, height } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PHOTO_PIXELS) {
    throw new Error("A report photo is too large to process safely. Upload a smaller PDF extract.");
  }
  const canvas = document.createElement("canvas");
  // Keep the full embedded resolution: these are evidence photos, not thumbnails of the PDF page.
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the report photos.");
  if (image.bitmap) context.drawImage(image.bitmap, 0, 0);
  else if (image.data) {
    const rgba = new Uint8ClampedArray(width * height * 4);
    if (image.kind === 3 || image.data.length === width * height * 4) rgba.set(image.data);
    else if (image.kind === 2 || image.data.length === width * height * 3) {
      for (let i = 0, j = 0; i < image.data.length; i += 3, j += 4) {
        rgba[j] = image.data[i]; rgba[j + 1] = image.data[i + 1]; rgba[j + 2] = image.data[i + 2]; rgba[j + 3] = 255;
      }
    } else if (image.kind === 1) {
      const stride = Math.ceil(width / 8);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const value = image.data[y * stride + (x >> 3)] & (128 >> (x & 7)) ? 255 : 0;
        const j = (y * width + x) * 4;
        rgba[j] = value; rgba[j + 1] = value; rgba[j + 2] = value; rgba[j + 3] = 255;
      }
    } else throw new Error("An embedded photo uses an unsupported image format.");
    context.putImageData(new ImageData(rgba, width, height), 0, 0);
  } else throw new Error("The PDF contains an unreadable photo. Please export the report with its photos embedded.");
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = "source-over";
  try {
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Unable to prepare a report photo.")), "image/jpeg", 0.96));
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
  onProgress?.({ page: 0, totalPages: 0, message: "Opening PDF report…" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder("ascii").decode(bytes.subarray(0, 1024)).indexOf("%PDF-") < 0) throw new Error("This file is not a valid PDF report.");
  ensureNotAborted(signal);
  const sourceSha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(byte => byte.toString(16).padStart(2, "0")).join("");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = `/api/checkout-pdf-worker?v=${pdfjs.version}`;
  const loading = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true, disableFontFace: true, stopAtErrors: true, maxImageSize: MAX_PHOTO_PIXELS });
  const abort = () => { void loading.destroy(); };
  signal?.addEventListener("abort", abort, { once: true });
  const pages: CheckoutPdfPage[] = [];
  const photos = new Map<string, CheckoutPdfPhoto[]>();
  const warnings: string[] = [];
  let previousSource: { sourceId: string; evidenceKey?: string; supported: boolean } | undefined;
  let totalPhotoBytes = 0;
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > MAX_CHECKOUT_PDF_PAGES) throw new Error("Upload a report with no more than 250 pages, or split it into smaller PDFs.");
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      ensureNotAborted(signal);
      onProgress?.({ page: pageNumber, totalPages: pdf.numPages, message: `Reading page ${pageNumber} of ${pdf.numPages}…` });
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
        for (const image of boxes) {
          // Ignore logos/icons; report evidence in the supported layout is much larger.
          if (image.xMax - image.xMin < 25 || image.yMax - image.yMin < 25) continue;
          const target = checkoutPdfPhotoTarget(image, anchors, positions, previousSource);
          if (!target) {
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
          const photo = await imageFile(decoded, `${target.sourceId}-${target.label}-${list.length + 1}.jpg`);
          totalPhotoBytes += photo.size;
          if (totalPhotoBytes > MAX_EXTRACTED_PHOTO_BYTES) throw new Error("This report contains too many large photos for one upload. Split it into smaller PDFs.");
          list.push({ file: photo, label: target.label, sourcePage: pageNumber });
          photos.set(key, list);
        }
        if (anchors.length) previousSource = anchors[anchors.length - 1];
      } finally { page.cleanup(); }
    }
    ensureNotAborted(signal);
    const parsed = parseCheckoutPdfPages(pages);
    if (!parsed.rooms.length) throw new Error("No Block A/B defect details were found. Upload the UTMSPACE room defect report including its detailed findings, rather than a summary or scanned image.");
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
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    await loading.destroy().catch(() => {});
  }
}
