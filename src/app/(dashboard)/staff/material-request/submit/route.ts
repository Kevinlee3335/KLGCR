import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyActiveMaterialApprovers } from "@/lib/app-notifications";
import { requireRole } from "@/lib/auth";

export async function POST(request: Request) {
  const profile = await requireRole(["maintenance_staff"]);
  const form = await request.formData();
  const jobId = String(form.get("jobId") || "");
  const note = String(form.get("note") || "");
  const itemIds = form.getAll("itemId").map((value) => String(value || ""));
  const quantities = form.getAll("qty").map((value) => Number(value));
  const otherNames = form.getAll("otherItemName").map(value => String(value).trim());
  const items = itemIds.flatMap((inventory_item_id, index) => {
    const qty = quantities[index];
    return inventory_item_id && Number.isFinite(qty) && qty > 0 ? [{ inventory_item_id: inventory_item_id === "other" ? null : inventory_item_id, other_item_name:inventory_item_id === "other" ? otherNames[index] : null, qty }] : [];
  });
  const url = new URL("/staff/material-request", request.url);
  if (itemIds.some((id,index)=>id && (!Number.isFinite(quantities[index]) || quantities[index]<=0 || (id==="other" && !otherNames[index])))) {
    url.searchParams.set("error","Enter a name and valid quantity for every selected material.");
    return NextResponse.redirect(url,303);
  }
  if (!jobId || items.length === 0) {
    url.searchParams.set("error", "Select a job and at least one material with a valid quantity.");
    return NextResponse.redirect(url, 303);
  }
  if (new Set(items.map((item) => item.inventory_item_id || item.other_item_name?.toLowerCase())).size !== items.length) {
    url.searchParams.set("error", "Do not select the same material more than once.");
    return NextResponse.redirect(url, 303);
  }
  const supabase = await createClient();
  const { data: requestId, error } = await supabase.rpc("create_material_request", { p_job_id: jobId, p_note: note, p_items: items });
  if (error) {
    url.searchParams.set("error", error.message);
  } else {
    try {
      const { data: materialRequest } = await supabase.from("material_requests")
        .select("id,request_no,job:maintenance_jobs!job_id(job_no,room_no)")
        .eq("job_id", jobId)
        .eq("requested_by", profile.id)
        .eq("id",requestId)
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
