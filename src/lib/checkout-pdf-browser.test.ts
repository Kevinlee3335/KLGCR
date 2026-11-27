import { describe, expect, it } from "vitest";
import { checkoutPdfImageBoxes, checkoutPdfPhotoTarget, groupCheckoutPdfLines } from "./checkout-pdf-browser";

const OPS = { save: 1, restore: 2, transform: 3, paintImageXObject: 4, paintInlineImageXObject: 5, paintImageXObjectRepeat: 6 };

describe("UTMSPACE evidence association", () => {
  it("joins split detail headings and keeps PDF-coordinate reading order", () => {
    expect(groupCheckoutPdfLines([
      { text: "Kebersihan Dinding", x: 200, y: 400 },
      { text: "Penemuan: Kulat", x: 30, y: 388 },
      { text: "DF-2026-0072", x: 30, y: 400.1 },
      { text: "— Blok A / Aras 1 / A103 —", x: 90, y: 400 },
    ])).toEqual([
      { text: "DF-2026-0072 — Blok A / Aras 1 / A103 — Kebersihan Dinding", x: 30, y: 400.1 },
      { text: "Penemuan: Kulat", x: 30, y: 388 },
    ]);
  });

  it("finds the real photo rectangle through nested PDF transforms", () => {
    const boxes = checkoutPdfImageBoxes({
      fnArray: [3, 1, 3, 4, 2, 1, 3, 4, 2],
      argsArray: [
        [0.24, 0, 0, -0.24, 0, 594.96], [], [456.25, 0, 0, -609.375, 712.5, 2153.125], ["before"], [],
        [], [456.25, 0, 0, -609.375, 2340.625, 2153.125], ["after"], [],
      ],
    }, OPS);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].xMin).toBeCloseTo(171);
    expect(boxes[0].xMax).toBeCloseTo(280.5);
    expect(boxes[0].yMin).toBeCloseTo(78.21);
    expect(boxes[0].yMax).toBeCloseTo(224.46);
    expect(boxes[1].xMin).toBeCloseTo(561.75);
  });

  it("links both Before and After photos to A207 without declaring the defect repaired", () => {
    const anchors = [{ sourceId: "DF-2026-0321", y: 380 }];
    const labels = [{ text: "Sebelum", x: 205, width: 38, y: 190 }, { text: "Selepas", x: 598, width: 35, y: 190 }];
    expect(checkoutPdfPhotoTarget({ image: "a", xMin: 185, xMax: 267, yMin: 205, yMax: 351 }, anchors, labels)).toEqual({ sourceId: "DF-2026-0321", label: "before" });
    expect(checkoutPdfPhotoTarget({ image: "b", xMin: 562, xMax: 671, yMin: 205, yMax: 351 }, anchors, labels)).toEqual({ sourceId: "DF-2026-0321", label: "after" });
  });

  it("does not attach a photo to the next defect lower on the page", () => {
    const anchors = [{ sourceId: "DF-2026-0074", y: 570 }, { sourceId: "DF-2026-0075", y: 320 }];
    const first = { image: "a", xMin: 171, xMax: 280, yMin: 376, yMax: 522 };
    const second = { image: "b", xMin: 171, xMax: 280, yMin: 131, yMax: 277 };
    const labels = [{ text: "Sebelum", x: 210, width: 35, y: 365 }, { text: "Sebelum", x: 210, width: 35, y: 120 }];
    expect(checkoutPdfPhotoTarget(first, anchors, labels)?.sourceId).toBe("DF-2026-0074");
    expect(checkoutPdfPhotoTarget(second, anchors, labels)?.sourceId).toBe("DF-2026-0075");
  });

  it("does not invent Before/After labels or attach unrelated page logos", () => {
    const image = { image: "a", xMin: 171, xMax: 280, yMin: 376, yMax: 522 };
    expect(checkoutPdfPhotoTarget(image, [], [{ text: "Sebelum", x: 210, y: 365 }])).toBeNull();
    expect(checkoutPdfPhotoTarget(image, [{ sourceId: "DF-2026-1", y: 570 }], [])).toBeNull();
  });

  it("preserves multiple numbered After captions and room-scoped source identities", () => {
    const image = { image: "a", xMin: 394, xMax: 449, yMin: 160, yMax: 277 };
    const labels = [{ text: "Selepas 1", x: 404, width: 35, y: 149 }];
    const first = [{ sourceId: "DF-2026-0599", evidenceKey: "B:B116:DF-2026-0599", y: 310 }];
    const second = [{ sourceId: "DF-2026-0599", evidenceKey: "B:B117:DF-2026-0599", y: 310 }];
    expect(checkoutPdfPhotoTarget(image, first, labels)).toEqual({ sourceId: "DF-2026-0599", label: "after", evidenceKey: "B:B116:DF-2026-0599" });
    expect(checkoutPdfPhotoTarget(image, second, labels)).toEqual({ sourceId: "DF-2026-0599", label: "after", evidenceKey: "B:B117:DF-2026-0599" });
  });

  it("keeps a recheck photograph distinct from an After photograph", () => {
    const image = { image: "a", xMin: 171, xMax: 280, yMin: 376, yMax: 522 };
    const labels = [{ text: "Semakan semula (20/11/2026)", x: 171, width: 109, y: 365 }];
    expect(checkoutPdfPhotoTarget(image, [{ sourceId: "DF-2026-0581", y: 570 }], labels)).toEqual({ sourceId: "DF-2026-0581", label: "recheck" });
  });
});
