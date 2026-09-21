"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function submitRating(token: string, rating: number) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) redirect(`/feedback/${token}?error=invalid-rating`);
  const admin = createAdminClient();
  const { error } = await admin.from("maintenance_job_feedback")
    .update({ rating, submitted_at: new Date().toISOString() })
    .eq("token", token)
    .is("submitted_at", null);
  if (error) redirect(`/feedback/${token}?error=save-failed`);
  redirect(`/feedback/${token}?submitted=1`);
}
