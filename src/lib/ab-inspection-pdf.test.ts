// @vitest-environment node
import { PageSizes, PDFDocument } from "pdf-lib";
import { expect, it } from "vitest";
import { loadAbInspectionGroups } from "@/lib/ab-inspection-catalog";
import { generateAbInspectionPdf, generateAbInspectionReportPack } from "@/lib/ab-inspection-pdf";
import type { FlexInspectionSnapshot } from "@/lib/flex-inspection";

const inspection: FlexInspectionSnapshot = {
  period: "2026-11",
  revision: 1,
  exceptions: {},
  inspectionDate: "2026-11-05",
  inspectedByName: "Inspection Tester",
  completedAt: "2026-11-05T04:00:00.000Z",
};

it("reconciles October workbook quantities and retains the three explicit missing positions", () => {
  const groups = loadAbInspectionGroups();
  const units = groups.flatMap(group => group.units.map(unit => unit.id));
  expect(new Set(units).size).toBe(391);
  expect(units).toHaveLength(391);
  expect(Object.fromEntries(["hose-reel", "fire-extinguisher", "exit-sign", "emergency-light"].map(report =>
    [report, groups.filter(group => group.report === report).reduce((sum, group) => sum + group.quantity, 0)],
  ))).toEqual({ "hose-reel": 32, "fire-extinguisher": 159, "exit-sign": 85, "emergency-light": 115 });
  expect(groups.filter(group => group.quantity === 0).map(group => [
    group.report, group.block, group.level, group.location, group.note,
  ])).toEqual([
    ["exit-sign", "B", 8, "Staircase Wing A", "No exit light"],
    ["emergency-light", "A", 4, "Lobby", "No emergency light"],
    ["emergency-light", "A", 7, "Corridor Wing B", "No emergency light"],
  ]);
  expect(groups.filter(group => group.report === "emergency-light" && group.block === "B" && group.level === 9))
    .toMatchObject([{ location: "Lift Motor Room", quantity: 1 }]);
  expect(groups.filter(group => group.report === "fire-extinguisher" && group.location === "Bungalow XA3")
    .map(group => group.level)).toEqual([1, 2, 3]);
});

it("packs all four A4 inspection reports with the template orientations", async () => {
  const pdf = await PDFDocument.load(await generateAbInspectionReportPack(inspection));
  expect(pdf.getTitle()).toBe("Block A & B Fire Safety Inspection - 2026-11");
  const [width, height] = PageSizes.A4;
  expect(pdf.getPages().map(page => page.getSize())).toEqual([
    { width, height }, { width: height, height: width }, { width: height, height: width }, { width: height, height: width },
  ]);
});

it("includes an appendix for the location remarks and renders the saved inspector's signature", async () => {
  const group = loadAbInspectionGroups().find(group => group.report === "hose-reel")!;
  const pdf = await PDFDocument.load(await generateAbInspectionPdf("hose-reel", {
    ...inspection, exceptions: { [group.units[0].id]: "Door latch is broken. ".repeat(18) },
  }, { strokes: [[[0.1, 0.5], [0.5, 0.8], [0.9, 0.2]]] }));
  expect(pdf.getTitle()).toBe("HOSE REEL INSPECTION (BLOCK A & B) - NOVEMBER 2026");
  expect(pdf.getPageCount()).toBe(2);
});

it("paginates remarks with many short lines inside the character limit", async () => {
  const [group] = loadAbInspectionGroups();
  const remarks = "x\n".repeat(200) + "End";
  const pdf = await PDFDocument.load(await generateAbInspectionPdf("hose-reel", {
    ...inspection, exceptions: { [group.units[0].id]: remarks },
  }));
  expect(pdf.getPageCount()).toBeGreaterThan(2);
});
