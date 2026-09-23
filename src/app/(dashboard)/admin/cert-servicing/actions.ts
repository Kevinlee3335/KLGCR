"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function saveComplianceRecord(data: FormData) {
  const actor = await requireRole(["admin"]);
  const db = await createClient();
  const title = String(data.get("title") || "").trim();
  const nextDueDate = String(data.get("nextDueDate") || "");
  if (!title || !nextDueDate) redirect("/admin/cert-servicing?error=Title%20and%20next%20due%20date%20are%20required.");
  const { error } = await db.from("compliance_records").insert({
    record_type: String(data.get("recordType") || "servicing"),
    title,
    provider: String(data.get("provider") || "").trim() || null,
    reference_no: String(data.get("referenceNo") || "").trim() || null,
    last_completed_date: String(data.get("lastCompletedDate") || "") || null,
    next_due_date: nextDueDate,
    frequency: String(data.get("frequency") || "").trim() || null,
    contact_name: String(data.get("contactName") || "").trim() || null,
    contact_phone: String(data.get("contactPhone") || "").trim() || null,
    notes: String(data.get("notes") || "").trim() || null,
    created_by: actor.id,
  });
  if (error) redirect("/admin/cert-servicing?error=" + encodeURIComponent(error.message));
  revalidatePath("/admin/cert-servicing");
  redirect("/admin/cert-servicing?saved=1");
}
