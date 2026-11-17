import { NextResponse } from "next/server";
import { generateAbInspectionPdf } from "@/lib/ab-inspection-pdf";
import { getSessionProfile } from "@/lib/auth";
import { FLEX_INSPECTION_ROLES, isAbReportType, isFlexPeriod, isFlexReportType, type FlexInspectionSnapshot } from "@/lib/flex-inspection";
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
  const search = new URL(request.url).searchParams;
  const scope = search.get("scope") ?? "cd";
  if (!isFlexPeriod(period) || (scope !== "ab" && scope !== "cd")) {
    return new NextResponse("Report not found.", { status: 404 });
  }

  let generate: ((inspection: FlexInspectionSnapshot, signature?: unknown) => Promise<Uint8Array>) | undefined;
  if (scope === "ab" && isAbReportType(report)) {
    generate = (inspection, signature) => generateAbInspectionPdf(report, inspection, signature);
  }
  if (scope === "cd" && isFlexReportType(report)) {
    generate = (inspection, signature) => generateFlexInspectionPdf(report, inspection, signature);
  }
  if (!generate) return new NextResponse("Report not found.", { status: 404 });

  try {
    const { inspection, inspectorSignature } = await loadFlexInspectionForReport(period, scope);
    if (!inspection.completedAt) return new NextResponse("Complete this inspection before exporting.", { status: 409 });

    const pdf = await generate(inspection, inspectorSignature);
    const disposition = search.get("view") === "1" ? "inline" : "attachment";
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${scope === "ab" ? "AB" : "Flex"}-${report}-${period}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Fire safety report export failed", { scope, period, report, error });
    return new NextResponse("Unable to export this report. Please try again.", { status: 503 });
  }
}
