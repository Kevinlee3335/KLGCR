import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSessionProfile } from "@/lib/auth";
import { companySealDataUrl } from "@/lib/company-seal";
import { FLEX_INSPECTION_ROLES, isFlexPeriod, isFlexReportType } from "@/lib/flex-inspection";
import { loadFlexGroups, loadFlexReportTemplate } from "@/lib/flex-inspection-catalog";
import { loadFlexInspectionForReport } from "@/lib/flex-inspection-store";
import { renderFlexInspectionPdf } from "@/lib/flex-reports/pdf";
import { signatureSchema } from "@/lib/purchase-orders/signature";
import { smoothSignatureStroke } from "@/lib/purchase-orders/signature-drawing";

export const runtime = "nodejs";

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ period: string; report: string }> },
) {
  const profile = await getSessionProfile();
  if (!profile || !FLEX_INSPECTION_ROLES.includes(profile.role)) {
    return new NextResponse("Access denied.", { status: 403 });
  }

  const { period, report } = await params;
  if (!isFlexPeriod(period) || !isFlexReportType(report)) {
    return new NextResponse("Report not found.", { status: 404 });
  }

  try {
    const { inspection, inspectorSignature } = await loadFlexInspectionForReport(period);
    if (!inspection.completedAt) return new NextResponse("Complete this inspection before exporting.", { status: 409 });

    const [groups, template, signature] = await Promise.all([
      loadFlexGroups(),
      loadFlexReportTemplate(report),
      signatureImage(inspectorSignature),
    ]);
    const stamp = signature ? Buffer.from(companySealDataUrl.split(",")[1], "base64") : undefined;
    const pdf = await renderFlexInspectionPdf(report, inspection, { groups, template, signature, stamp });
    const disposition = new URL(request.url).searchParams.get("view") === "1" ? "inline" : "attachment";
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="Flex-${report}-${period}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Flex report export failed", { period, report, error });
    return new NextResponse("Unable to export this report. Please try again.", { status: 503 });
  }
}
