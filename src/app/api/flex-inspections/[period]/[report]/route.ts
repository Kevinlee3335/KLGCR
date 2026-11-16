import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { FLEX_INSPECTION_ROLES, isFlexPeriod, isFlexReportType } from "@/lib/flex-inspection";
import { loadFlexInspectionForReport } from "@/lib/flex-inspection-store";
import { generateFlexInspectionPdf } from "@/lib/flex-reports/generate";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ period: string; report: string }> },
) {
  if (process.env.VERCEL_ENV === "preview") return new NextResponse("Report not found.", { status: 404 });

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

    const pdf = await generateFlexInspectionPdf(report, inspection, inspectorSignature);
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
