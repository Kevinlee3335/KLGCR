import type { AppRole } from "@/lib/types";

export const FLEX_INSPECTION_TITLE = "Fire Safety Inspections";
export const FLEX_INSPECTION_PATH = "/flex-inspections";
export const FLEX_INSPECTION_ROLES: AppRole[] = ["admin", "maintenance_staff"];
export const FLEX_REMARK_MAX_LENGTH = 500;

export const FLEX_REPORT_LABELS = {
  "fire-extinguisher": "Fire Extinguisher",
  "exit-sign": "Exit Sign",
  "emergency-light": "Emergency Light",
};

export type FlexReportType = keyof typeof FLEX_REPORT_LABELS;

export const AB_REPORT_LABELS = {
  "hose-reel": "Hose Reel",
  ...FLEX_REPORT_LABELS,
};

export type AbReportType = keyof typeof AB_REPORT_LABELS;

export type InspectionGroup = {
  id: string;
  report: AbReportType;
  block: "A" | "B" | "C" | "D" | "Other";
  level: number | null;
  location: string;
  quantity: number;
  sourceCell: string;
  units: { id: string; label: string }[];
  note?: string;
};

export type FlexGroup = InspectionGroup & { report: FlexReportType; block: "C" | "D" };

export type FlexInspectionSnapshot = {
  period: string;
  revision: number;
  exceptions: Record<string, string>;
  inspectionDate: string | null;
  inspectedByName: string | null;
  completedAt: string | null;
};

export type FlexSaveInput = {
  period: string;
  revision: number;
  exceptions: Record<string, string>;
  inspectionDate: string;
  complete: boolean;
};

export type FlexSaveResult =
  | { ok: true; inspection: FlexInspectionSnapshot }
  | { ok: false; message: string; code?: "conflict" };

export function isFlexPeriod(period: string): boolean {
  return typeof period === "string" && /^[2-9]\d{3}-(0[1-9]|1[0-2])$/.test(period);
}

export function isFlexReportType(report: string): report is FlexReportType {
  return Object.hasOwn(FLEX_REPORT_LABELS, report);
}

export function isAbReportType(report: string): report is AbReportType {
  return Object.hasOwn(AB_REPORT_LABELS, report);
}
