import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyActiveMaterialApprovers } from "@/lib/app-notifications";

export async function POST(request: Request) {
  const form = await request.formData();
  const jobId = String(form.get("jobId") || "");
  const note = String(form.get("note") || "");
  const itemIds = form.getAll("itemId").map((value) => String(value || ""));
  const quantities = form.getAll("qty").map((value) => Number(value));
  const items = itemIds.flatMap((inventory_item_id, index) => {
    const qty = quantities[index];
    return inventory_item_id && Number.isFinite(qty) && qty > 0 ? [{ inventory_item_id, qty }] : [];
  });
  const url = new URL("/staff/material-request", request.url);
  if (!jobId || items.length === 0) {
    url.searchParams.set("error", "Select a job and at least one material with a valid quantity.");
    return NextResponse.redirect(url, 303);
  }
  if (new Set(items.map((item) => item.inventory_item_id)).size !== items.length) {
    url.searchParams.set("error", "Do not select the same material more than once.");
    return NextResponse.redirect(url, 303);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_material_request", { p_job_id: jobId, p_note: note, p_items: items });
  if (error) {
    url.searchParams.set("error", error.message);
  } else {
    try {
      const { data: userResult } = await supabase.auth.getUser();
      const { data: materialRequest } = await supabase.from("material_requests")
        .select("id,request_no,job:maintenance_jobs!job_id(job_no,room_no)")
        .eq("job_id", jobId)
        .eq("requested_by", userResult.user?.id || "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (materialRequest) {
        const job = materialRequest.job as unknown as { job_no: string; room_no: string } | null;
        await notifyActiveMaterialApprovers({
          type: "material_request",
          title: "New material request",
          body: materialRequest.request_no + " for " + (job?.job_no || "a maintenance job") + " · Room " + (job?.room_no || "—") + " is awaiting review.",
          href: "/admin/material-requests",
          entityId: materialRequest.id,
        });
      }
    } catch (notificationError) {
      console.error("Unable to notify material approvers", notificationError);
    }
    url.searchParams.set("success", "created");
  }
  return NextResponse.redirect(url, 303);
}
