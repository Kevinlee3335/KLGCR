import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { getArchivedFireSafetyInspectionUrl } from "@/lib/fire-safety-inspection-archive";
import {
  FIRE_SAFETY_ARCHIVE_ROLES,
  isFireSafetyArchiveScope,
} from "@/lib/fire-safety-inspection-folders";
import { isFlexPeriod } from "@/lib/flex-inspection";
import { isFlexPreview } from "@/lib/flex-inspection-review-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scope: string; period: string }> },
) {
  if (isFlexPreview()) return new NextResponse("Report not found.", { status: 404 });
  const { scope, period } = await params;
  if (!isFireSafetyArchiveScope(scope) || !isFlexPeriod(period)) {
    return new NextResponse("Report not found.", { status: 404 });
  }

  const profile = await getSessionProfile();
  if (!profile || !FIRE_SAFETY_ARCHIVE_ROLES.includes(profile.role)) {
    return new NextResponse("Access denied.", { status: 403 });
  }

  try {
    const download = new URL(request.url).searchParams.get("download") === "1";
    const url = await getArchivedFireSafetyInspectionUrl(scope, period, download);
    if (!url) return new NextResponse("Report not found.", { status: 404 });
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("Fire safety report archive could not be opened", { scope, period, error });
    return new NextResponse("Unable to open this report. Please try again.", { status: 503 });
  }
}
