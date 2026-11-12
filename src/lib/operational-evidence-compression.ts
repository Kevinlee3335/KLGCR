const COMPRESS_ABOVE_BYTES = 768 * 1024;
const MAX_LONG_EDGE = 2048;
const JPEG_QUALITY = 0.85;
const REQUIRED_SAVINGS_RATIO = 0.15;

async function compressCameraJpeg(file: File) {
  let bitmap: ImageBitmap | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    bitmap = undefined;

    const output = await new Promise<Blob | null>((resolve) => canvas!.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (output?.type !== "image/jpeg" || !output.size || output.size > file.size * (1 - REQUIRED_SAVINGS_RATIO)) {
      return file;
    }
    return new File([output], file.name, { type: output.type, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap?.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
}

export async function prepareOperationalEvidencePhotos(files: File[]): Promise<File[]> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return files;

  // Release each decoded camera image before starting the next one on the phone.
  const prepared: File[] = [];
  for (const file of files) {
    prepared.push(file.type === "image/jpeg" && file.size > COMPRESS_ABOVE_BYTES ? await compressCameraJpeg(file) : file);
  }
  return prepared;
}
