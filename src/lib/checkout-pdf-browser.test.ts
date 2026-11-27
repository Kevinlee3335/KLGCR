import { afterEach, describe, expect, it, vi } from "vitest";
import { checkoutPdfImageBoxes, checkoutPdfMissingPhotoCaptions, checkoutPdfPhotoTarget, encodeCheckoutPdfPhoto, groupCheckoutPdfLines, yieldCheckoutPdfToBrowser } from "./checkout-pdf-browser";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

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

  it("matches a small captioned photo instead of treating all small images as icons", () => {
    const image = { image: "tiny", xMin: 210, xMax: 225, yMin: 400, yMax: 420 };
    expect(checkoutPdfPhotoTarget(image, [{ sourceId: "DF-2026-1", y: 450 }], [{ text: "Sebelum", x: 200, width: 35, y: 390 }])).toEqual({ sourceId: "DF-2026-1", label: "before" });
  });

  it("detects a dropped Before image even when the After column says no photo", () => {
    const positions = [
      { text: "Sebelum", x: 210, width: 32, y: 365 },
      { text: "Selepas", x: 602, width: 28, y: 470 },
      { text: "Tiada gambar", x: 594, width: 44, y: 499 },
    ];
    const missing = checkoutPdfMissingPhotoCaptions([], [{ sourceId: "DF-2026-0071", y: 553 }], positions);
    expect(missing.map(item => [item.sourceId, item.label])).toEqual([["DF-2026-0071", "before"]]);
  });

  it("accepts genuine Before and After no-photo placeholders in their own columns", () => {
    const positions = [
      { text: "Sebelum", x: 210, width: 32, y: 470 },
      { text: "Tiada gambar", x: 204, width: 44, y: 499 },
      { text: "Selepas", x: 602, width: 28, y: 470 },
      { text: "Tiada gambar", x: 594, width: 44, y: 499 },
    ];
    expect(checkoutPdfMissingPhotoCaptions([], [{ sourceId: "DF-2026-0071", y: 553 }], positions)).toEqual([]);
  });

  it("does not let one placeholder excuse two nearby captions in the same DF and column", () => {
    const positions = [
      { text: "Sebelum", x: 210, width: 32, y: 470 },
      { text: "Selepas", x: 212, width: 28, y: 450 },
      { text: "Tiada gambar", x: 204, width: 44, y: 499 },
    ];
    expect(checkoutPdfMissingPhotoCaptions([], [{ sourceId: "DF-2026-0071", y: 553 }], positions).map(item => item.label)).toEqual(["after"]);
  });

  it("does not borrow a nearby no-photo placeholder from a preceding DF", () => {
    const anchors = [{ sourceId: "DF-2026-1", y: 550 }, { sourceId: "DF-2026-2", y: 300 }];
    const positions = [{ text: "Sebelum", x: 210, width: 32, y: 280 }, { text: "Tiada gambar", x: 204, width: 44, y: 310 }];
    expect(checkoutPdfMissingPhotoCaptions([], anchors, positions).map(item => item.sourceId)).toEqual(["DF-2026-2"]);
  });

  it("verifies numbered After and Recheck captions against their actual photos", () => {
    const anchors = [{ sourceId: "DF-2026-1", y: 550 }];
    const positions = [
      { text: "Selepas 1", x: 204, width: 44, y: 365 },
      { text: "Selepas 2", x: 404, width: 44, y: 365 },
      { text: "Semakan semula (20/11/2026)", x: 574, width: 104, y: 365 },
    ];
    const images = [226, 426, 626].map(x => ({ image: "a", xMin: x - 45, xMax: x + 45, yMin: 380, yMax: 500 }));
    expect(checkoutPdfMissingPhotoCaptions(images, anchors, positions)).toEqual([]);
    expect(checkoutPdfMissingPhotoCaptions(images.slice(0, 2), anchors, positions).map(item => item.label)).toEqual(["recheck"]);
  });

  it("cannot cover a new room's caption using the preceding room's identically numbered DF", () => {
    const previous = { sourceId: "DF-2026-0599", evidenceKey: "B:B116:DF-2026-0599", supported: true };
    const anchors = [{ sourceId: "DF-2026-0599", evidenceKey: "B:B117:DF-2026-0599", y: 300, supported: true }];
    const positions = [{ text: "Sebelum", x: 210, width: 32, y: 280 }, { text: "Tiada gambar", x: 204, width: 44, y: 310 }];
    const oldRoomImage = { image: "old", xMin: 181, xMax: 271, yMin: 325, yMax: 440 };
    expect(checkoutPdfPhotoTarget(oldRoomImage, anchors, positions, previous)).toBeNull();
    expect(checkoutPdfMissingPhotoCaptions([oldRoomImage], anchors, positions, previous)).toHaveLength(1);
  });

  it("does not require images for summary captions or rooms outside A/B", () => {
    const caption = { text: "Sebelum", x: 210, width: 32, y: 280 };
    expect(checkoutPdfMissingPhotoCaptions([], [], [caption])).toEqual([]);
    expect(checkoutPdfMissingPhotoCaptions([], [{ sourceId: "DF-2026-1", y: 300, supported: false }], [caption])).toEqual([]);
  });
});

describe("cooperative PDF photo processing", () => {
  it("yields a task to the browser and lets cancellation interrupt a pending yield", async () => {
    const abort = new AbortController();
    vi.stubGlobal("scheduler", { yield: vi.fn(() => new Promise<void>(() => {})) });
    const pending = yieldCheckoutPdfToBrowser(abort.signal);
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("provides a timer task boundary when scheduler.yield is unavailable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("scheduler", undefined);
    const tick = vi.fn();
    const pending = yieldCheckoutPdfToBrowser().then(tick);
    await Promise.resolve();
    expect(tick).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    await pending;
    expect(tick).toHaveBeenCalledOnce();
  });

  it("can cancel during chunked RGB conversion and releases the canvas before encoding", async () => {
    const abort = new AbortController();
    const canvas = document.createElement("canvas");
    const context = { putImageData: vi.fn() };
    vi.spyOn(canvas, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const encode = vi.spyOn(canvas, "toBlob");
    vi.spyOn(document, "createElement").mockReturnValue(canvas);
    let ticks = 0, time = 0;
    vi.spyOn(performance, "now").mockImplementation(() => time += 20);
    vi.stubGlobal("scheduler", { yield: vi.fn(async () => { if (++ticks === 3) abort.abort(); }) });
    await expect(encodeCheckoutPdfPhoto({ width: 512, height: 512, kind: 2, data: new Uint8Array(512 * 512 * 3) }, "photo.jpg", abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(context.putImageData).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  });

  it("releases the canvas when the browser cannot create a graphics context", async () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(null);
    vi.spyOn(document, "createElement").mockReturnValue(canvas);
    await expect(encodeCheckoutPdfPhoto({ width: 1, height: 1, data: new Uint8Array([1, 2, 3]), kind: 2 }, "photo.jpg")).rejects.toThrow("could not prepare");
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  });

  it("cancels a pending JPEG encoding without waiting for its callback and releases the canvas", async () => {
    const abort = new AbortController();
    const canvas = document.createElement("canvas");
    const context = { drawImage: vi.fn(), fillRect: vi.fn() };
    vi.spyOn(canvas, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    let callback: BlobCallback | undefined;
    let ready: (() => void) | undefined;
    const encoding = new Promise<void>(resolve => { ready = resolve; });
    vi.spyOn(canvas, "toBlob").mockImplementation(value => { callback = value; ready?.(); });
    vi.spyOn(document, "createElement").mockReturnValue(canvas);
    vi.stubGlobal("scheduler", { yield: async () => {} });
    const pending = encodeCheckoutPdfPhoto({ width: 1, height: 1, bitmap: {} as ImageBitmap }, "photo.jpg", abort.signal);
    await encoding;
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
    callback?.(new Blob(["late native encoding"], { type: "image/jpeg" }));
  });

  it("rejects incomplete pixel buffers instead of saving an altered evidence photo", async () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    vi.spyOn(document, "createElement").mockReturnValue(canvas);
    vi.stubGlobal("scheduler", { yield: async () => {} });
    await expect(encodeCheckoutPdfPhoto({ width: 10, height: 10, data: new Uint8Array([1, 2, 3]), kind: 2 }, "photo.jpg")).rejects.toThrow("incomplete");
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  });
});
