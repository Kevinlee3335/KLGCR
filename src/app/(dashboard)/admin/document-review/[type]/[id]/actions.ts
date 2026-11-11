"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireRole } from "@/lib/auth";
import { scheduleBillingMail } from "@/lib/billing-mail";
import { dispatchDocumentReviewPushes } from "@/lib/document-review-notifications";
import { isDocumentReviewTarget } from "@/lib/document-review-status";
import { documentReviewers, documentVerification } from "@/lib/document-review";
import { deliverGymReport } from "@/lib/gym-report-delivery";
import { signatureSchema } from "@/lib/purchase-orders/signature";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function schedulePostApprovalWork(work: () => Promise<void>) {
  try {
    after(work);
  } catch {
    console.error("Document follow-up pending retry");
  }
}

export async function advanceDocumentReview(form: FormData) {
  const startedAt = performance.now();
  const user = await requireRole(["admin"]);
  const type = String(form.get("type"));
  const id = String(form.get("id"));
  if (!isDocumentReviewTarget(type, id)) throw Error("Invalid document");

  const entries = await documentVerification(type, id);
  const assigned = documentReviewers[entries.length];
  if (assigned?.id !== user.id) throw Error("This document is awaiting another reviewer.");

  const session = await createClient();
  const sendReviewPushes = () => dispatchDocumentReviewPushes(id)
    .catch(() => console.error("Document phone notification pending retry"));

  if (entries.length < 2) {
    const verified = await session.rpc("verify_document", { p_type: type, p_id: id });
    if (verified.error) throw Error(verified.error.message);
    await sendReviewPushes();
  } else if (type === "billing") {
    const approved = await session.rpc("approve_billing_run", { billing_run_id: id });
    if (approved.error) throw Error(approved.error.message);
    scheduleBillingMail(id);
    schedulePostApprovalWork(sendReviewPushes);
  } else {
    const db = createAdminClient();
    const signature = await session.from("user_e_signatures").select("signature").eq("user_id", user.id).maybeSingle();
    if (signature.error) throw Error("Unable to read your personal E-signature. Please contact the administrator.");
    if (!signature.data) throw Error("Save your personal E-signature first.");

    const saved = await db.from("gym_monthly_approvals").update({
      approved_at: new Date().toISOString(),
      approver: user.id,
      signature: signatureSchema.parse(signature.data.signature),
      verifications: entries,
    }).eq("id", id).is("approved_at", null);
    if (saved.error) throw Error(saved.error.message);

    // The approved record can also be picked up by the membership job if this execution stops.
    schedulePostApprovalWork(async () => {
      const deliveryStartedAt = performance.now();
      let confirmed = false;
      try {
        await deliverGymReport(id);
        confirmed = true;
      } catch {
        console.error("Gym report delivery pending retry");
      } finally {
        console.info("Document email attempt", { type, confirmed, durationMs: Math.round(performance.now() - deliveryStartedAt) });
      }
    });
  }

  const reviewPath = `/admin/document-review/${type}/${id}`;
  revalidatePath("/admin");
  revalidatePath("/admin/members/report-approvals");
  revalidatePath(reviewPath);
  if (entries.length === 2) {
    console.info("Document approval saved", { type, durationMs: Math.round(performance.now() - startedAt) });
  }
  redirect(reviewPath);
}
