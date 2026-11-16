import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { companySealDataUrl } from "@/lib/company-seal";
import { FLEX_REPORT_LABELS, type FlexInspectionSnapshot, type FlexReportType } from "@/lib/flex-inspection";
import { loadFlexGroups, loadFlexReportTemplate } from "@/lib/flex-inspection-catalog";
import { signatureSchema } from "@/lib/purchase-orders/signature";
import { smoothSignatureStroke } from "@/lib/purchase-orders/signature-drawing";
import { renderFlexInspectionPdf } from "./pdf";

async function signatureImage(value: unknown): Promise<Uint8Array | undefined> {
  const parsed = signatureSchema.safeParse(value);
  if (!parsed.success) return undefined;

  const signature = parsed.data;
  if (signature.imageDataUrl) {
    const png = Buffer.from(signature.imageDataUrl.split(",")[1], "base64");
    return sharp(png).trim({ background: "#ffffff" }).png().toBuffer();
  }

  const paths = signature.strokes.map(stroke => {
    const points = smoothSignatureStroke(stroke).map(([x, y]) => `${3 + x * 594},${3 + y * 174}`).join(" ");
    return `<polyline points="${points}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180"><g fill="none" stroke="#173e8d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
  return sharp(Buffer.from(svg)).trim({ background: "#ffffff" }).png().toBuffer();
}

async function inspectionPdfRenderer(inspection: FlexInspectionSnapshot, inspectorSignature?: unknown) {
  const [groups, signature] = await Promise.all([loadFlexGroups(), signatureImage(inspectorSignature)]);
  const stamp = signature ? Buffer.from(companySealDataUrl.split(",")[1], "base64") : undefined;
  return async (report: FlexReportType) => {
    const template = await loadFlexReportTemplate(report);
    return renderFlexInspectionPdf(report, inspection, { groups, template, signature, stamp });
  };
}

export async function generateFlexInspectionPdf(
  report: FlexReportType,
  inspection: FlexInspectionSnapshot,
  inspectorSignature?: unknown,
): Promise<Uint8Array> {
  const render = await inspectionPdfRenderer(inspection, inspectorSignature);
  return render(report);
}

export async function generateFlexInspectionReportPack(
  inspection: FlexInspectionSnapshot,
  inspectorSignature?: unknown,
): Promise<Uint8Array> {
  const render = await inspectionPdfRenderer(inspection, inspectorSignature);
  const merged = await PDFDocument.create();
  merged.setTitle(`Flex Fire Safety Inspection - ${inspection.period}`);
  for (const report of Object.keys(FLEX_REPORT_LABELS) as FlexReportType[]) {
    const document = await PDFDocument.load(await render(report), { updateMetadata: false });
    const pages = await merged.copyPages(document, document.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return merged.save();
}
