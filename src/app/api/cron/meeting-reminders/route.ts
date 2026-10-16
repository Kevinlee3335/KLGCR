import { NextRequest, NextResponse } from "next/server";
import { sendMeetingReminders } from "@/lib/send-meeting-reminders";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return sendMeetingReminders();
}
