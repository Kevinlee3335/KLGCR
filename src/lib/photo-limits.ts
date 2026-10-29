export const MAX_EVIDENCE_PHOTOS = 20;
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateEvidenceFiles(files: File[]) {
  if (!files.length || files.length > MAX_EVIDENCE_PHOTOS) return "Attach between 1 and 20 photos.";
  if (files.some(file => !EVIDENCE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_EVIDENCE_BYTES)) return "Use JPG, PNG or WebP photos up to 10 MB each.";
  return null;
}
