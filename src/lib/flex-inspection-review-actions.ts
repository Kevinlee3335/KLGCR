"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { dispatchFlexInspectionMail } from "@/lib/flex-inspection-mail";
import { FLEX_INSPECTION_PATH, isFlexPeriod } from "@/lib/flex-inspection";
import type { FlexReviewResult } from "@/lib/flex-inspection-review";
import { flexReviewer, isFlexPreview, toFlexReview, type FlexReviewRow } from "@/lib/flex-inspection-review-store";
import { createAdminClient } from "@/lib/supabase/admin";

export async function verifyFlexInspection(period: string): Promise<FlexReviewResult> {
  const profile = await getSessionProfile();
  if (!profile || !flexReviewer(profile) || isFlexPreview()) {
    return { ok: false, message: "Your account cannot verify this Flex inspection." };
  }
  if (!isFlexPeriod(period)) return { ok: false, message: "Choose a valid inspection month." };

  const { data, error } = await createAdminClient()
    .rpc("record_flex_inspection_verification", { p_period: period, p_actor_id: profile.id })
    .maybeSingle<FlexReviewRow & { period: string }>();
  if (error || !data?.period) {
    return { ok: false, message: "Unable to verify this inspection. Refresh the page and try again." };
  }

  const review = toFlexReview(data);
  if (review.kevinVerifiedAt && review.fikriVerifiedAt && review.mailStatus === "pending" && process.env.VERCEL_ENV === "production") {
    after(async () => {
      try {
        await dispatchFlexInspectionMail(period);
      } catch {
        console.error("Flex inspection email remains queued", { period });
      }
    });
  }
  revalidatePath(FLEX_INSPECTION_PATH);
  revalidatePath("/admin");
  return { ok: true, review };
}
