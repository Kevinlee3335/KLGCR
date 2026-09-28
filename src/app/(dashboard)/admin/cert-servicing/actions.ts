"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export async function saveComplianceRecord(data: FormData) {
  const actor = await requireRole(["admin"]);
  const db = await createClient();
  const title = String(data.get("title") || "").trim();
  const nextDueDate = String(data.get("nextDueDate") || "");
  const recordId=String(data.get("recordId")||"");
  const lastDate=String(data.get("lastCompletedDate")||"");
  const type=String(data.get("recordType")||"servicing");
  const status=String(data.get("status")||"active");
  if (!title || !z.string().date().safeParse(nextDueDate).success || (lastDate&&!z.string().date().safeParse(lastDate).success) || !["servicing","certificate_license"].includes(type) || !["active","renewal_in_progress","expired","completed"].includes(status) || (recordId&&!z.string().uuid().safeParse(recordId).success)) redirect("/admin/cert-servicing?error=Please%20enter%20valid%20record%20details%20and%20dates.");
  const values = {
    record_type: type,
    status,
    title,
    provider: String(data.get("provider") || "").trim() || null,
    reference_no: String(data.get("referenceNo") || "").trim() || null,
    last_completed_date: String(data.get("lastCompletedDate") || "") || null,
    next_due_date: nextDueDate,
    frequency: String(data.get("frequency") || "").trim() || null,
    contact_name: String(data.get("contactName") || "").trim() || null,
    contact_phone: String(data.get("contactPhone") || "").trim() || null,
    notes: String(data.get("notes") || "").trim() || null,
  };
  const { data: saved, error } = await (recordId ? db.from("compliance_records").update(values).eq("id",recordId) : db.from("compliance_records").insert({...values,created_by:actor.id})).select("id").maybeSingle();
  if (error) redirect("/admin/cert-servicing?error=" + encodeURIComponent(error.message));
  if (!saved) redirect("/admin/cert-servicing?error=Record%20not%20found%20or%20could%20not%20be%20saved.");
  revalidatePath("/admin/cert-servicing");
  redirect("/admin/cert-servicing?saved=1");
}
