import { describe, expect, it } from "vitest";
import { canonicalCheckoutPdfRoom, checkoutPdfPhotoCaption, checkoutPdfRoomSchema } from "./checkout-pdf-import";

const room = () => ({ blockId: 1, blockCode: "A", roomNo: "A103", filename: "report.pdf", fileHash: "a".repeat(64),
  defects: [{ sourceId: "DF-2026-0072", originalItem: "Kebersihan Dinding", originalFinding: "Cat terkopek Dinding kulat",
    sourceStatus: "Baru", description: "Wall moldy and paint peeling", title: "Wall moldy and paint peeling A103",
    reportedDate: "2026-11-04", pageNumber: 2, photos: [] }] });

describe("PDF intake validation", () => {
  it("accepts ISO report dates and retains both findings without requiring a photo", () => {
    expect(checkoutPdfRoomSchema.parse(room()).defects[0]).toMatchObject({
      reportedDate: "2026-11-04", originalFinding: "Cat terkopek Dinding kulat", photos: [],
    });
  });
  it("blocks a mismatched block, duplicate reference and unknown photo format", () => {
    expect(checkoutPdfRoomSchema.safeParse({ ...room(), blockCode: "B" }).success).toBe(false);
    const duplicate = room(); duplicate.defects.push(duplicate.defects[0]);
    expect(checkoutPdfRoomSchema.safeParse(duplicate).success).toBe(false);
    const unsupported = room();
    expect(checkoutPdfRoomSchema.safeParse({ ...unsupported, defects: [{ ...unsupported.defects[0], photos: [
      { label: "before", sourcePage: 2, type: "application/pdf", size: 100 },
    ] }] }).success).toBe(false);
  });
  it("normalizes saved room aliases without merging a different block", () => {
    expect(["103", "A103", "A-103"].map(value => canonicalCheckoutPdfRoom(value, "A"))).toEqual(["A103", "A103", "A103"]);
    expect(canonicalCheckoutPdfRoom("B103", "A")).not.toBe("A103");
  });
  it("identifies source After evidence without presenting it as completed work", () => {
    const caption = checkoutPdfPhotoCaption({ kind: "inspection", utmspace_pdf_source: {
      title: "Wall paint peeling A207", sourceId: "DF-2026-0321", label: "after", sourcePage: 14,
    } });
    expect(caption).toContain("After (UTMSPACE report)");
    expect(caption).toContain("Wall paint peeling A207");
    expect(caption).not.toMatch(/complet|rectified/i);
    expect(checkoutPdfPhotoCaption({ kind: "completion" })).toBe("completion");
  });
});
