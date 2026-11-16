// @vitest-environment node
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
import { generateFlexInspectionReportPack } from "./generate";
import type { FlexReportType } from "../flex-inspection";

vi.mock("@/lib/flex-inspection-catalog", () => ({
  loadFlexGroups: async () => [
    { report: "fire-extinguisher", sourceCell: "F6" },
    { report: "exit-sign", sourceCell: "E6" },
    { report: "emergency-light", sourceCell: "G12" },
  ].map(group => ({ ...group, id: group.report, units: [{ id: group.report, label: "1" }] })),
  loadFlexReportTemplate: async (report: FlexReportType) => {
    const [width, height] = report === "fire-extinguisher" ? [140, 198] : [198, 140];
    return sharp({ create: { width, height, channels: 3, background: "#fff" } }).png().toBuffer();
  },
}));

it("combines the three original-format reports without changing their page sizes", async () => {
  const bytes = await generateFlexInspectionReportPack({
    period: "2026-11",
    revision: 1,
    exceptions: {},
    inspectionDate: "2026-11-16",
    inspectedByName: "Test Inspector",
    completedAt: "2026-11-16T07:00:00Z",
  });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPages().map(page => page.getSize())).toEqual([
    { width: 595.44, height: 842.4 },
    { width: 842.4, height: 595.44 },
    { width: 842.4, height: 595.44 },
  ]);
});
