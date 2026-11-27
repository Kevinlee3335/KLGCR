import { z } from "zod";

export const checkoutPdfPhotoSchema = z.object({
  label: z.enum(["before", "after", "recheck"]),
  sourcePage: z.number().int().min(1).max(250),
  type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(10 * 1024 * 1024),
});

const sourceText = z.string().trim().max(2000);
export const checkoutPdfRoomSchema = z.object({
  blockId: z.number().int().positive(),
  blockCode: z.enum(["A", "B"]),
  roomNo: z.string().trim().regex(/^[AB][0-9]{3,4}$/, "A room number such as A103 is required."),
  filename: z.string().trim().min(1).max(255),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  defects: z.array(z.object({
    sourceId: z.string().regex(/^DF-\d{4}-\d{4,8}$/),
    inspectionId: z.string().regex(/^PM-\d{4}-\d{4,8}$/).optional(),
    originalItem: sourceText.min(1),
    originalFinding: sourceText.min(1),
    originalAction: sourceText.optional(),
    sourceStatus: sourceText.min(1),
    description: sourceText.min(1),
    title: z.string().trim().min(1).max(240),
    reportedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    pageNumber: z.number().int().min(1).max(250),
    conflictingDetails: z.array(z.object({
      originalItem: sourceText, originalFinding: sourceText,
      originalAction: sourceText.optional(), sourceStatus: sourceText,
      pageNumber: z.number().int().min(1).max(250), y: z.number().finite().optional(),
    })).max(20).optional(),
    photos: z.array(checkoutPdfPhotoSchema).max(20),
  })).min(1).max(50),
}).superRefine((room, context) => {
  if (!room.roomNo.startsWith(room.blockCode)) {
    context.addIssue({ code: "custom", path: ["roomNo"], message: "The room number must match its block." });
  }
  const ids = room.defects.map(defect => defect.sourceId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["defects"], message: "Duplicate UTMSPACE defect reference in this room." });
  }
  if (room.defects.reduce((count, defect) => count + defect.photos.length, 0) > 20) {
    context.addIssue({ code: "custom", path: ["defects"], message: "Import a maximum of 20 photos for one room." });
  }
});

export type CheckoutPdfRoomInput = z.infer<typeof checkoutPdfRoomSchema>;
export type CheckoutPdfUploadedPhoto = { path: string; sourceId: string; photoIndex: number };

/** Compare A103, A-103 and 103 without treating A103 as a Block B room. */
export function canonicalCheckoutPdfRoom(value: string, blockCode: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.startsWith(blockCode) ? normalized : blockCode + normalized;
}

export function checkoutPdfPhotoCaption(photo: { kind: string; utmspace_pdf_source?: unknown }) {
  const source = photo.utmspace_pdf_source;
  if (!source || typeof source !== "object" || Array.isArray(source)) return photo.kind;
  const value = source as Record<string, unknown>;
  const label = value.label === "after" ? "After (UTMSPACE report)"
    : value.label === "recheck" ? "Recheck (UTMSPACE report)" : "Before (UTMSPACE report)";
  return [typeof value.title === "string" ? value.title : value.sourceId, label,
    Number.isInteger(value.sourcePage) ? `PDF page ${value.sourcePage}` : null].filter(Boolean).join(" · ");
}

export function checkoutPdfDefectTitle(defect: { description?: unknown; utmspace_pdf_source?: unknown }) {
  const source = defect.utmspace_pdf_source;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const title = (source as Record<string, unknown>).title;
    if (typeof title === "string" && title.trim()) return title;
  }
  return String(defect.description || "");
}
