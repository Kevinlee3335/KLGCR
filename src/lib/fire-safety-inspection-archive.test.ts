// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getArchivedFireSafetyInspectionUrl, listArchivedFireSafetyInspections } from "./fire-safety-inspection-archive";

const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  preview: vi.fn(),
  loadReport: vi.fn(),
  generateAb: vi.fn(),
  generateCd: vi.fn(),
  list: vi.fn(),
  select: vi.fn(),
  not: vi.fn(),
  order: vi.fn(),
  bucket: vi.fn(),
  sign: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.db }));
vi.mock("@/lib/flex-inspection-review-store", () => ({ isFlexPreview: mocks.preview }));
vi.mock("@/lib/flex-inspection-store", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/flex-inspection-store")>(),
  loadFlexInspectionForReport: mocks.loadReport,
}));
vi.mock("@/lib/ab-inspection-pdf", () => ({ generateAbInspectionReportPack: mocks.generateAb }));
vi.mock("@/lib/flex-reports/generate", () => ({ generateFlexInspectionReportPack: mocks.generateCd }));

const inspection = { period: "2026-11", completedAt: "2026-11-14T04:00:00Z" };
const url = "https://example.org/report.pdf";
const signed = { data: { signedUrl: url }, error: null };
const missing = { data: null, error: { code: "NoSuchKey" } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.preview.mockReturnValue(false);
  mocks.loadReport.mockResolvedValue({ inspection, inspectorSignature: "signature" });
  mocks.db.mockReturnValue({ storage: { from: mocks.bucket }, from: mocks.list });
  mocks.bucket.mockReturnValue({ createSignedUrl: mocks.sign, upload: mocks.upload });
  mocks.list.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ not: mocks.not });
  mocks.not.mockReturnValue({ order: mocks.order });
  mocks.order.mockResolvedValue({ data: [{ period: "2026-11" }], error: null });
});

describe("fire safety inspection archive", () => {
  it("lists completed months from only the selected block pair", async () => {
    await expect(listArchivedFireSafetyInspections("ab")).resolves.toEqual([{ period: "2026-11" }]);
    expect(mocks.list).toHaveBeenCalledWith("ab_fire_safety_inspections");
    expect(mocks.not).toHaveBeenCalledWith("completed_at", "is", null);
    expect(mocks.order).toHaveBeenCalledWith("period", { ascending: false });
  });

  it("keeps trial access away from live data and storage", async () => {
    mocks.preview.mockReturnValue(true);
    await expect(listArchivedFireSafetyInspections("cd")).resolves.toEqual([]);
    await expect(getArchivedFireSafetyInspectionUrl("ab", "2026-11")).resolves.toBeNull();
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.loadReport).not.toHaveBeenCalled();
  });

  it("rejects a draft before checking the archive object", async () => {
    mocks.loadReport.mockResolvedValue({ inspection: { ...inspection, completedAt: null } });
    await expect(getArchivedFireSafetyInspectionUrl("ab", "2026-11")).resolves.toBeNull();
    expect(mocks.bucket).not.toHaveBeenCalled();
  });

  it("returns an existing C/D PDF without rendering or replacing it", async () => {
    mocks.sign.mockResolvedValue(signed);
    await expect(getArchivedFireSafetyInspectionUrl("cd", "2026-11", true)).resolves.toBe(url);
    expect(mocks.loadReport).toHaveBeenCalledWith("2026-11", "cd");
    expect(mocks.sign).toHaveBeenCalledWith("cd/2026-11.pdf", 120, {
      download: "Block-CD-Fire-Safety-Inspection-2026-11.pdf",
    });
    expect(mocks.generateCd).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("archives the selected A/B PDF once and accepts a concurrently created file", async () => {
    const pdf = Buffer.from("%PDF-1.7");
    mocks.generateAb.mockResolvedValue(pdf);
    mocks.sign.mockResolvedValueOnce(missing).mockResolvedValueOnce(signed);
    mocks.upload.mockResolvedValue({ error: { code: "ResourceAlreadyExists" } });
    await expect(getArchivedFireSafetyInspectionUrl("ab", "2026-11")).resolves.toBe(url);
    expect(mocks.generateAb).toHaveBeenCalledWith(inspection, "signature");
    expect(mocks.generateCd).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledWith("ab/2026-11.pdf", pdf, {
      cacheControl: "0", contentType: "application/pdf", upsert: false,
    });
  });
});
