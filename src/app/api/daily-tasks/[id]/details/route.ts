import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { signEvidencePhotos } from "@/lib/evidence-urls";
import { createClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const profile = await getSessionProfile();
    if (profile?.role !== "admin" && profile?.role !== "management_viewer") {
      return NextResponse.json({ error: "Access denied" }, { status: 403, headers });
    }

    const { id } = await params;
    const taskId = Number(id);
    const view = request.nextUrl.searchParams.get("view");
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(taskId) || (view !== "photos" && view !== "timeline")) {
      return NextResponse.json({ error: "Invalid daily task details request." }, { status: 400, headers });
    }

    const db = await createClient();
    if (view === "photos") {
      const { data, error } = await db.from("daily_task_photos")
        .select("id,storage_path,created_at").eq("task_id", taskId).order("created_at").order("id");
      if (error) throw error;
      const photos = await signEvidencePhotos(db, "checkout-evidence", data ?? []);
      return NextResponse.json({
        view,
        photos: photos.map(({ id, created_at, url }) => ({ id, created_at, url: url ?? null })),
      }, { headers });
    }

    const activity = [];
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await db.from("daily_task_activity")
        .select("id,action,comment,created_at,actor:profiles!daily_task_activity_actor_id_fkey(full_name)")
        .eq("task_id", taskId).order("created_at").order("id").range(from, from + pageSize - 1);
      if (error) throw error;
      activity.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }
    return NextResponse.json({ view, activity }, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load daily task details. Please try again." }, { status: 503, headers });
  }
}
