import { documentReviewerStage } from "@/lib/document-review-status";
import { emptyFlexReview, type FlexMailStatus, type FlexReview, type FlexReviewer } from "@/lib/flex-inspection-review";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

export type FlexReviewRow = {
  kevin_verified_at: string | null;
  fikri_verified_at: string | null;
  status: FlexMailStatus;
  sent_at: string | null;
  error: string | null;
};

export function flexReviewer(profile: Profile | null): FlexReviewer | null {
  const stage = profile?.role === "admin" ? documentReviewerStage(profile.id) : null;
  return stage === "kevin" || stage === "fikri" ? stage : null;
}

export function isFlexPreview() {
  return process.env.VERCEL_ENV === "preview";
}

export function toFlexReview(row: FlexReviewRow | null): FlexReview {
  if (!row) return emptyFlexReview;
  return {
    kevinVerifiedAt: row.kevin_verified_at,
    fikriVerifiedAt: row.fikri_verified_at,
    mailStatus: row.status,
    sentAt: row.sent_at,
    error: row.error,
  };
}

export async function loadFlexReview(period: string): Promise<FlexReview> {
  const { data, error } = await createAdminClient().from("flex_inspection_reviews")
    .select("kevin_verified_at,fikri_verified_at,status,sent_at,error").eq("period", period).maybeSingle<FlexReviewRow>();
  if (error) throw Error("Unable to load Flex verification.");
  return toFlexReview(data);
}

export async function flexInspectionsAwaitingReview(actorId: string) {
  const { data, error } = await createAdminClient().rpc("list_flex_inspections_awaiting_verification", { p_actor_id: actorId });
  if (error) throw Error("Unable to load Flex inspections awaiting verification.");
  return (data ?? []) as { period: string; inspection_date: string }[];
}
